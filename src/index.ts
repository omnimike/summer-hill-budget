
import * as readline from 'readline';
import * as webdriverio from 'webdriverio';
import * as stream from 'stream';

main();

async function main() {
    const username = await question('Enter you lds.org username: ');
    const password = await question('Enter you lds.org password: ', true);

    log('\nExtracting data from lds.org');
    try {
        const rawExpenses = await loginToLdsOrg(username, password);
        const expenses = parseExpenses(rawExpenses);
        console.log(JSON.stringify(expenses, null, 4));
    } catch {
        process.exit();
    }
}

function log(msg: string) {
    process.stderr.write(msg + '\n');
}

async function loginToLdsOrg(username: string, password: string): Promise<Array<RawExpense>> {
    const options = {
        desiredCapabilities: {
            browserName: 'chrome'
        },
        port: 9515,
        path: '/',
        services: ['chromedriver'],
        waitforTimeout: 10000
    };
    const client = webdriverio.remote(options);

    try {
        await client.init();
        await client.url('https://www.lds.org/finance');
        await client.click('#IDToken1');
        await client.keys(username);
        await client.click('#IDToken2');
        await client.keys(password);
        await client.click('#login-submit-button');
        await client.click('[href="#/expenses"]');
        await client.pause(10000);
        const result = await client.execute(`
            const expenses = [];
            const rowEls = document.querySelectorAll('[expenseid]');
            rowEls.forEach(rowEl => {
                const expense = {};
                const cells = rowEl.querySelectorAll('.divCell');
                cells.forEach(cell => {
                    const fieldEl = cell.querySelector('span.ng-binding');
                    const valueEl = cell.querySelector('p');
                    if (fieldEl && valueEl) {
                        const field = fieldEl.textContent.trim();
                        const value = valueEl.textContent.trim();

                        switch (field) {
                        case 'Date':
                            expense.date = value;
                            break;
                        case 'Ref#':
                            expense.reference = value;
                            break;
                        case 'Category':
                            expense.category = value;
                            break;
                        case 'Purpose':
                            expense.purpose = value;
                            break;
                        case 'Amount':
                            expense.amount = value;
                        }
                    }
                });
                expenses.push(expense);
            });
            return expenses;
        `);
        const expenses = result.value;

        return expenses;
    } finally {
        await client.end();
    }
}

interface RawExpense {
    amount: string,
    category: string,
    date: string,
    purpose: string,
    reference: string
}

interface BudgetTotal {
    amount: number,
    category: string,
    month: string
}

function parseExpenses(rawExpenses: Array<RawExpense>): Array<BudgetTotal> {
    const expenseMap: {[month: string]: {[category: string]: number}} = {};
    rawExpenses.forEach((expense: RawExpense) => {
        const amount = parseAmount(expense.amount);
        const month = parseDate(expense.date, expense.purpose) || 'no date';
        const category = parseCategory(expense.category);

        if (!expenseMap[month]) {
            expenseMap[month] = {};
        }
        if (!expenseMap[month][category]) {
            expenseMap[month][category] = 0;
        }
        expenseMap[month][category] += amount;
    });
    const expenses: Array<BudgetTotal> = [];

    for (let month in expenseMap) {
        for (let category in expenseMap[month]) {
            expenses.push({
                amount: expenseMap[month][category],
                category: category,
                month: month
            });
        }
    }
    return expenses;
}

function parseAmount(rawAmount: string): number {
    return parseFloat(rawAmount.replace(/[^0-9.]/g, ''));
}

function parseDate(rawDate: string, purpose: string): string|null {
    let match = /^(\d{4})-(\d{1,2}) .*/.exec(purpose);
    if (match) {
        return formatDate(match[1], match[2]);
    }
    match = /^(\d{1,2})\/(\d{4}) .*/.exec(purpose);
    if (match) {
        return formatDate(match[2], match[1]);
    }

    const months: {[month: string]: string} = {
        'Jan': '01',
        'Feb': '02',
        'Mar': '03',
        'Apr': '04',
        'May': '05',
        'Jun': '06',
        'Jul': '07',
        'Aug': '08',
        'Sep': '09',
        'Oct': '10',
        'Nov': '11',
        'Dec': '12'
    };
    match = /\d{2} ([A-Z][a-z][a-z]) (\d{4})/.exec(rawDate);
    if (match) {
        const month = months[match[1]];
        if (!month) {
            return null;
        }
        return formatDate(match[2], month);
    }
    return null;
}

function formatDate(year: string, month: string): string {
    return year + '-' + (month.length < 2 ? '0' + month : month);
}

function parseCategory(rawCategory: string): string {
    return rawCategory.replace('; Australia GST', '');
}

function question(prompt: string = '', silent: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
        if (prompt) {
            process.stderr.write(prompt);
        }

        const stdin = process.stdin;
        stdin.resume();
        if (stdin.setRawMode) {
            stdin.setRawMode(true);
            stdin.resume();
        }
        stdin.setEncoding('utf8');

        let response = '';
        const cb = (ch: string) => {
            ch = ch + '';

            switch (ch) {
            case "\n":
            case "\r":
            case "\u0004":
                // They've finished typing their response
                process.stderr.write('\n');
                if (stdin.setRawMode) {
                    stdin.setRawMode(false);
                }
                stdin.pause();
                stdin.removeListener('data', cb);
                resolve(response);
                break;

            case "\u0003":
                // Ctrl-C
                stdin.removeListener('data', cb);
                reject(new Error('interrupt'));
                break;

            default:
                // More passsword characters
                if (!silent) {
                    process.stderr.write(ch);
                }
                response += ch;
                break;
            }
        };
        stdin.on('data', cb);
    });
}
