
import * as readline from 'readline';
import * as webdriverio from 'webdriverio';
import * as stream from 'stream';

let muted = false;
const mutableStdout = new stream.Writable({
  write: function(chunk, encoding, callback) {
    if (!muted) {
        process.stderr.write(chunk as string, encoding);
    }
    callback();
  }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: mutableStdout,
    terminal: true
});

rl.question('Enter your lds.org username: ', username => {
    process.stderr.write('Enter your lds.org password: ');
    muted = true;
    rl.question('', password => {
        muted = false;
        rl.close();
        console.log('\nExtracting data from lds.org');
        loginToLdsOrg(username, password).then(expenses => {
            console.log(JSON.stringify(expenses, null, 4));
        });
    });
});

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

function expensesForBudget(expenses: Array<RawExpense>): Array<BudgetTotal> {
    const budgetMap: {[key:string]:BudgetTotal} = {};

}
