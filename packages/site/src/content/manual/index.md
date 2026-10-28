# Getting started

Rupea rests on one idea: your money is a ledger of plain text files. You write to the files, or import statements into them, and Rupea reads them to show where every rupee went. Words with a special meaning in Rupea are in the [glossary](glossary.md).

Rupea is a work in progress and not ready for everyday use yet. To sign in, Rupea emails you a code, and your first sign-in makes a ledger called **Personal** to start in. Running Rupea on your own computer will need no sign-in, but that is not built yet.

## Your ledger is text

Every transaction is a few lines of text: a date and a description, then one line for each account money moves into or out of.

```
2026-10-03 UPI-BIGBASKET
    Expenses:Food:Groceries   2,315.40
    Assets:Bank:HDFC
```

This says that on 3 October, 2,315.40 went from your HDFC account to groceries. The amounts in a transaction add up to zero, so the line without an amount takes what balances the rest: −2,315.40.

The files are the record. Everything Rupea shows is worked out from them, and you can edit them in Rupea under **Files**, or in any text editor. [Ledger files](ledger-files.md) describes everything they can hold.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/files-dark.png">
  <img class="frame" src="/screenshots/files-light.png" alt="A ledger file, plain text you own" width="2880" height="1800">
</picture>

## Start with what you have

Pick a day to start from, and write down what each account held that day. Open **Files**, press **New file**, call it `opening.rupea`, and write:

```
2026-10-01 Opening balances
    Assets:Bank:HDFC         2,50,000.00
    Liabilities:Card:HDFC      -12,400.00
    Equity:Opening
```

`Assets` are what you own, and `Liabilities` what you owe, so a card bill is negative. `Equity:Opening` balances the rest: it stands for everything before your ledger starts. Your net worth now shows under **Accounts**.

## Import your statements

From that day on, let your statements fill the ledger. Open **Files**, then **Import**, and press **Upload statements**. Rupea reads PDF, CSV and Excel statements, and shows the transactions it finds. For each one, it suggests the other account from the transactions already in your ledger.

Check them, press **Add to ledger**, and name a file, such as `hdfc.rupea`. Each statement adds what's new to it.

Rupea knows statements from HDFC Bank, IDFC FIRST Bank and State Bank of India. For any other bank, you describe the statement once, in a schema, and every statement like it imports by itself. [Importing statements](importing.md) and [Writing schemas](schemas.md) cover both.

## See where it went

- **Accounts** shows your net worth over time, then every account that makes it up, with what it cost and what it gained.
- **Expenses** shows what you spent each month, split by account and set against the period before.
- **Transactions** lists every transaction, newest first, each with the file and line it came from.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/expenses-dark.png">
  <img class="frame" src="/screenshots/expenses-light.png" alt="Spending by month over a year, by account" width="2880" height="1800">
</picture>
