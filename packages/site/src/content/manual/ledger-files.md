# Ledger files

Your ledger is plain text files. Rupea reads them, and everything you see is worked out from them: change a file, and the app follows. You can edit them under **Files** in Rupea, or in any text editor.

Rupea's files end in `.rupea`. They are close to the format of [ledger](https://ledger-cli.org) and [hledger](https://hledger.org), so most of what you know from those carries over.

## Transactions

A transaction starts with a line that holds a date and a description. Below it, each account the money moves into or out of gets a line of its own, called a **posting**. Postings are indented by a tab or at least two spaces.

```
2026-10-01 SALARY OCT ACME TECH
    Assets:Bank:HDFC   1,42,000.00
    Income:Salary     -1,42,000.00
```

The amounts in a transaction add up to zero: money that arrives somewhere left somewhere else. One posting may leave its amount out, and takes whatever balances the rest:

```
2026-10-03 UPI-BIGBASKET
    Expenses:Food:Groceries   2,315.40
    Assets:Bank:HDFC
```

A blank line between transactions is optional, but makes a file easier to read.

### Dates and times

Dates can be written in most common ways: `2026-10-01`, `01/10/2026`, `1 Oct 2026` or `October 1, 2026`. Day-first dates are read as Indian dates are written, so `01/10/2026` is the 1st of October.

A time can follow the date, as `2026-10-01 14:30` or `2026-10-01 2:30 pm`. You rarely need one. It settles the order of two transactions on the same day in different files.

### Amounts

Amounts are in rupees unless you name something else. Commas and `₹` are ignored, so `142000`, `1,42,000.00` and `₹1,42,000` are the same amount. Money going out of an account is negative.

## Accounts

An account is a name made of parts separated by colons, like `Expenses:Food:Groceries`. The first part is its type, one of five:

- **Assets**: what you own, such as bank accounts, wallets and investments.
- **Liabilities**: what you owe, such as credit cards and loans.
- **Income**: where money comes from, such as a salary or interest.
- **Expenses**: what money was spent on.
- **Equity**: opening balances, for money you had before your ledger starts.

The parts after the type are yours to choose. An account exists as soon as a posting names it. There's nothing to declare first.

## Comments and metadata

A line starting with `;` is a comment, and Rupea ignores it.

A line like `- key: value` attaches a note to the line above it: a transaction, a posting, or, above the first transaction, the whole file.

```
- source: HDFC savings statements

2026-10-05 UPI-ZOMATO
    - note: team dinner
    Expenses:Food:Dining   640.00
    Assets:Bank:HDFC
```

You can use any key. A few mean something to Rupea. An import writes `checksum` to name its statement, and `group` and `same-as` link the same money seen by two statements. [Duplicates](duplicates.md) explains those.

## Balance assertions

`=` after a posting's amount states what the account holds right after it:

```
2026-10-21 INTEREST CREDIT
    Assets:Bank:HDFC   1,212.00 = 2,51,869.10
    Income:Interest
```

Rupea checks each assertion against every transaction before it, in every file, and warns you where they differ. Imports write one on every row of a statement that prints a running balance.

## Shares and funds

A posting can hold units of something other than rupees, such as shares or fund units. Name it after the amount, and give its price with `@`:

```
2026-06-03 Buy Infosys
    Assets:Zerodha   10 INFY @ 1500
    Assets:Bank:HDFC
```

Each buy opens a **lot**: these 10 INFY, bought at 1,500 each. A sale names the lot it takes from with its cost in braces, and states the gain:

```
2027-03-01 Sell Infosys
    Assets:Zerodha   -4 INFY {1500} @ 1700
    Assets:Bank:HDFC   6800
    Income:Gains      -800
```

`{1500}` takes the oldest lot that cost 1,500 each. `{1500, 2026-06-03}` picks it by date as well. The transaction only balances when the gain is right. `@@` gives a total price instead of a price for each unit.

### Prices

A `P` line records what something was worth on a day:

```
P 2026-10-17 INFY 1820
```

Rupea can also fetch prices for you. A `P` line that ends in a source and a symbol links your name for a commodity to that source. Use [mfapi](https://www.mfapi.in) for Indian mutual funds, by scheme code, or Yahoo Finance for shares.

```
P * NIFTYIDX mfapi:120716
P * INFY yahoo:INFY.NS
```

`*` links it for all time. A date links it from that day.

## Problems

Some transactions can't be read, such as one that doesn't balance, or one that names an account without a type. Rupea leaves each one out and lists it as a problem, with its file and line. The rest of the file still counts.

A line that can't start a transaction is different. Rupea stops reading the file at that line, because it can't tell where the next transaction starts.

A balance assertion that doesn't match is a warning, not a problem. The transaction still counts.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/problems-dark.png">
  <img class="frame" src="/screenshots/problems-light.png" alt="A transaction that is off by 500, shown above its file" width="2880" height="1800">
</picture>
