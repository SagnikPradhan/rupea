# Rupee

[![Coverage](https://coveralls.io/repos/github/SagnikPradhan/rupee/badge.svg?branch=master)](https://coveralls.io/github/SagnikPradhan/rupee?branch=master)

**Know where every rupee went.**

Every account, every statement, one ledger, in files you own.

> Work in progress, not ready for use.

## Quick start

```sh
pnpm install
cp .env.example .env
pnpm dev
```

The first run downloads the ML models for statement import into `data/models`.

## Development

```sh
pnpm models
pnpm test
pnpm test:e2e
pnpm check
pnpm lint
```

Domain terms are in [GLOSSARY.md](GLOSSARY.md), decisions in [docs/adr](docs/adr).

## Roadmap

### Features

#### Import

- [x] Import PDF, CSV and XLSX statements
- [x] Unlock password-protected PDFs
- [x] Teach Rupee a statement with a schema, and review the draft
- [ ] Import from common Indian banks, cards and brokers without writing a schema
- [ ] Import scanned statements
- [ ] Import statements sent by email or dropped in a Drive folder

#### Transactions

- [x] Keep your ledger in plain `.rupee` files
- [x] Edit ledger files in the browser
- [x] Browse transactions and postings
- [ ] Add and edit a transaction from a form
- [ ] Attach receipts and notes
- [ ] Search transactions, with a query language over postings

#### Categories

- [x] Guess categories from past transactions
- [ ] Set categories with rules on description, amount or account
- [ ] Show readable merchant names
- [ ] Recategorise many transactions at once

#### Matching

- [x] Merge a transaction reported by two sources, after reviewing the diff
- [ ] Match refunds to their charges
- [ ] Count transfers between your own accounts once
- [ ] Reconcile an account against a balance assertion

#### Investments and loans

- [ ] Track shares and funds: lots, cost basis, prices, holdings
- [ ] Track loans: what's left, and the interest in each payment
- [ ] Report capital gains for an Indian financial year

#### Budgets and bills

- [ ] Set a monthly budget per category and see what's left
- [ ] Save toward goals with an amount and a date
- [ ] See repeating payments and what's due next
- [ ] Track credit card statement and due dates
- [ ] Get alerts for overspending and bills due

#### Reports

- [ ] See balances, this month and what needs attention on a home page
- [ ] See every account with its balance
- [ ] View a balance sheet and an income statement
- [ ] Summarise a month or a year
- [ ] Report in one currency
- [ ] Chart spending, income, net worth and budgets over time
- [ ] Export as CSV

#### Sharing

- [x] Sign in with a code sent by email
- [x] Keep each ledger in your own storage
- [ ] Create and rename ledgers
- [ ] Invite members and let them write
- [ ] Back up your storage and restore it
- [ ] Use Rupee in a phone browser
- [ ] Use Rupee as a desktop app

### Internals

- [x] Read statement tables with ML models
- [x] Index ledger files into Postgres, served or embedded
- [x] Enforce member access
- [ ] Keep statements and schemas in the ledger
      ([ADR 0008](docs/adr/0008-statements-and-schemas-belong-to-the-ledger.md))
- [ ] Pick a chart library

## License

[MIT](LICENSE)
