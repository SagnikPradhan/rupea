# Writing schemas

A schema teaches Rupea to read one kind of statement, such as an HDFC savings account statement. It says three things:

- how to **recognise** the statement, so Rupea knows the schema fits it,
- which **account** its transactions belong to, and
- how to **read** each transaction: its date, amount and description.

Once a schema exists, every statement of that kind imports by itself. You write it once per bank and layout, not once per statement.

Rupea ships schemas for some common banks, called built-in schemas. Check the [list of what they cover](#built-in-schemas) before writing your own.

## Where schemas live

Schemas belong to a ledger, in its `schemas/` folder. Everyone who shares the ledger imports with the same schemas.

To write one, open **Import** in your ledger and press **Upload statements**. When Rupea doesn't know a statement, it asks you to **Describe this statement**. Start from **The example**, Rupea's built-in schema for HDFC savings accounts, which this page walks through. Edit it under **Format**, give it a **Name** like `axis-savings.yml` and press **Save format**. The transactions it finds show below as you type, so you can see straight away what your schema reads.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/import-format-dark.png">
  <img class="frame" src="/screenshots/import-format-light.png" alt="A schema being written for a savings account statement" width="1760" height="1284">
</picture>

Schemas are written in [YAML](https://learnxinyminutes.com/yaml/), a plain text format where indentation matters. Use spaces, not tabs.

## How Rupea sees a statement

Rupea first turns any statement, whether CSV, Excel or PDF, into a **grid**: rows and columns of text, like a spreadsheet. The import page shows this grid under your statement. Columns are lettered A, B, C and rows are numbered, just like a spreadsheet.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/import-grid-dark.png">
  <img class="frame" src="/screenshots/import-grid-light.png" alt="A savings account statement as a grid of rows and columns" width="1416" height="1424">
</picture>

A schema reads that grid. Each row that holds a transaction becomes a **record**, and each record becomes a transaction in the draft.

## A schema, line by line

This is the built-in schema for HDFC savings accounts:

```yaml
version: v1
name: HDFC Bank savings account
match:
  - text: HDFC
account: Assets:Bank:HDFC
header:
  text: Narration
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yy] }
  description: { from: [header: Narration] }
  amount:
    - from: [header: Withdrawal Amt.]
      pipe: [number, negate]
    - from: [header: Deposit Amt.]
      pipe: [number]
  balance: { from: [header: Closing Balance], pipe: [number] }
```

It reads a statement whose grid looks like this:

|     | A              | B          | C            | D               | E            | F               |
| --- | -------------- | ---------- | ------------ | --------------- | ------------ | --------------- |
| 1   | HDFC BANK Ltd. |            |              |                 |              |                 |
| 2   | Date           | Narration  | Chq./Ref.No. | Withdrawal Amt. | Deposit Amt. | Closing Balance |
| 3   | 29/08/26       | UPI-GROCER | 0000123      | 1,250.50        |              | 48,749.50       |
| 4   | 30/08/26       | SALARY AUG | 0000124      |                 | 50,000.00    | 98,749.50       |

- **`version: v1`** is the version of the schema format. Always write `v1`.
- **`name`** is a description for you. Rupea doesn't read it.
- **`match`** recognises the statement: this one fits any statement that mentions HDFC.
- **`account`** is the account every transaction goes to. A schema can't import without one.
- **`header`** finds the row of column names: the row with a cell that says `Narration`.
- **`fields`** say where each part of a transaction is.

Every row below the header whose date reads becomes a record. Rows 3 and 4 do. A blank row or a closing summary doesn't, so it drops out on its own.

The rest of this page goes through each part.

## Recognising a statement

When you upload a statement, Rupea looks for the one schema that fits it. A schema fits when **any one** of its `match` patterns is found, **and** the statement has the header and every column the schema reads.

```yaml
match:
  - text: State Bank of India
```

There are three kinds of pattern:

- **`text`** looks for words anywhere in the statement: in its grid, or in the lines of a PDF outside its tables. Case doesn't matter, so `text: hdfc` finds "HDFC BANK Ltd.".
- **`file`** looks at the file's name, with `*` standing for any characters. `file: '*hdfc*.pdf'` fits `Acct_HDFC_Aug.PDF`. Case doesn't matter here either.
- **`regex`** is a [regular expression](https://regexone.com/), for when plain words aren't enough. `regex: '^Statement for A/c \d+'` fits a cell that _starts_ with those words and an account number.

Most schemas only need the bank's name. The header and columns already tell two layouts from one bank apart: an HDFC savings statement has a `Narration` column, an HDFC card statement doesn't.

Rupea tries your ledger's schemas first, and its built-in schemas only when none of yours fit. If you see one of these instead of a draft:

- **`ExtractionUnrecognised`**: no schema fits. Write one, or check that its `match` words appear in the statement and its column names are spelled exactly as in the grid.
- **`ExtractionAmbiguous`**: more than one schema fits. Rupea never guesses between them, so make one `match` more specific, for example by adding the account type: `text: Savings Account`.
- **`ExtractionWithoutAccount`**: the schema that fits has no `account`. Add one.

### The account

```yaml
account: Assets:Bank:HDFC
```

Every transaction the schema reads moves money into or out of this account. It starts with an account type: `Assets` for bank accounts and wallets, `Liabilities` for credit cards and loans. If you keep two accounts at one bank, write a schema for each, with a `match` that tells them apart, like the last four digits of the account number.

## Finding the header and the rows

```yaml
header:
  text: Narration
```

The header is the row of column names. Rupea takes the first row with a cell that is exactly `Narration`. Pick a column name no other row is likely to repeat. Without a `header`, Rupea takes the first row that isn't blank.

If the column names vary a little between statements, use a regular expression instead:

```yaml
header:
  regex: '^Txn\s+Date$'
```

Every row below the header whose date reads is a record. Headers repeated on each page of a PDF are skipped. If no row's date reads, Rupea doesn't quietly import nothing: every row reports why its date didn't read, which usually means the date format is wrong.

Rarely, a row whose date reads isn't a transaction. Then `records` with a `where` replaces the date rule: a row is a record only when its cell in one column matches a regular expression. This keeps the rows that have a reference number:

```yaml
records:
  each: row
  where: { col: Chq./Ref.No., matches: '\d' }
```

`col` takes a column name from the header or a column letter.

## Reading fields

A record has five fields. Rupea needs the first three:

| Field         | What it holds                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `date`        | The day of the transaction.                                                                                                                                       |
| `amount`      | Money in is positive, money out is negative, as the account sees it.                                                                                              |
| `description` | What the statement says about the transaction.                                                                                                                    |
| `category`    | Optional. A category the statement gives. It counts only when it names an account, like `Expenses:Food`; otherwise Rupea guesses one from your past transactions. |
| `balance`     | Optional. The running balance the statement prints after each row. Rupea checks your ledger against it.                                                           |

Each field is a **path**: `from` says where the value is, and `pipe` turns the text found there into a value.

```yaml
date: { from: [header: Date], pipe: [date: dd/MM/yy] }
```

This reads: take the cell in the `Date` column of the record's row, and read it as a date written like `29/08/26`.

### Where a value is: locators

`from` is a list of **locators**. Rupea starts at the record's row and follows them in order.

- **`header: Date`** goes to the column named `Date`. The name must match the header cell exactly.
- **`col: B`** goes to column B. Use it when a column has no name, or its name changes.
- **`text: DR`** goes to the cell in the row that is exactly `DR`.
- **`regex: '^Paid to '`** goes to the first cell in the row matching the regular expression.
- **`left: 1`**, **`right: 1`** move that many columns.
- **`above: 1`**, **`below: 1`** move that many rows.

Most fields need one locator. Moving matters when a statement doesn't keep a value in its own column; see [PDF statements](#pdf-statements).

### Turning text into a value: transforms

`pipe` is a list of **transforms**, applied in order:

- **`date: dd/MM/yy`** reads a date in the given format. `dd` is the day, `MM` the month as a number, `MMM` its short name (`Aug`), `yy` or `yyyy` the year. A time can follow: `dd/MM/yyyy HH:mm`. The full list is in the [date-fns documentation](https://date-fns.org/docs/parse).
- **`number`** reads an amount. Commas, `₹` and `INR` are ignored, so `₹1,00,000.50` reads.
- **`negate`** flips the sign of an amount, for money going out.
- **`trim`** removes spaces from the start and end.
- **`replace: { from: ' DR', to: '' }`** replaces text before reading it.

`date` and `amount` need a `date` and a `number` transform; without one they stay text, and the row reports that it expected a date or an amount.

### Debits and credits: two paths

Many statements put money out and money in in two columns. Give a field a list of paths, and Rupea takes the first one that reads:

```yaml
amount:
  - from: [header: Withdrawal Amt.]
    pipe: [number, negate]
  - from: [header: Deposit Amt.]
    pipe: [number]
```

On a withdrawal row the first path reads, and the amount goes out. On a deposit row the withdrawal cell is empty, so Rupea tries the second.

## PDF statements

A PDF has no real columns, so Rupea finds the tables on each page and lines their words up into a grid. Check the grid on the import page before writing the fields; the columns may not be where the printed page suggests.

PDFs often mark an amount with `DR` or `CR` in the next cell instead of using two columns. The built-in schema for IDFC FIRST Bank credit cards reads them with locators that move:

```yaml
version: v1
name: IDFC FIRST Bank credit card
match:
  - text: IDFC FIRST Bank
account: Liabilities:Card:IDFC
header:
  text: Details
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yyyy] }
  description: { from: [header: Details] }
  amount:
    - from: [text: DR, left: 1]
      pipe: [number, negate]
    - from: [text: CR, left: 1]
      pipe: [number]
```

`[text: DR, left: 1]` finds the cell that says `DR` in the record's row, then reads the cell left of it. A row marked `CR` has no `DR` cell, so the first path finds nothing and the second reads the amount instead.

When the mark shares a cell with the amount, like `1,250.50 DR`, remove it with `replace` before reading the number, as the built-in IDFC schema for older statements does:

```yaml
amount:
  - from: [header: Amount]
    pipe: [replace: { from: ' DR', to: '' }, number, negate]
  - from: [header: Amount]
    pipe: [replace: { from: ' CR', to: '' }, number]
```

A credit cell still ends in ` CR` after the first path's `replace`, so it doesn't read as a number there, and the second path takes it.

## Built-in schemas

Rupea ships schemas for:

- HDFC Bank savings accounts and credit cards
- IDFC FIRST Bank credit cards
- State Bank of India savings accounts

A built-in schema is used only when none of your own schemas fit. The first time you save an import with one, Rupea copies it into your ledger's `schemas/` folder. From then on it is yours: change its `account` to the one you use, and edit it like any other schema.

## Reference

| Key                  | Required | Value                                                                                                                          |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `version`            | yes      | `v1`                                                                                                                           |
| `name`               | yes      | Any text.                                                                                                                      |
| `match`              | no       | A list of patterns: `text`, `file` or `regex`. Any one fits. Without it, a schema is only used when you open it in the editor. |
| `account`            | yes      | An account, starting with its account type.                                                                                    |
| `header`             | no       | `text:` a cell's exact text, or `regex:` a pattern for it.                                                                     |
| `records`            | no       | `each: row`, and optionally `where: { col, matches }`.                                                                         |
| `fields.date`        | yes      | A path, or a list of paths.                                                                                                    |
| `fields.amount`      | yes      | A path, or a list of paths.                                                                                                    |
| `fields.description` | yes      | A path, or a list of paths.                                                                                                    |
| `fields.category`    | no       | A path, or a list of paths.                                                                                                    |
| `fields.balance`     | no       | A path, or a list of paths.                                                                                                    |

A path is `{ from: [locators], pipe: [transforms] }`; `pipe` is optional.

| Locator                           | Goes to                                            |
| --------------------------------- | -------------------------------------------------- |
| `header: Name`                    | The column with that header.                       |
| `col: B`                          | That column.                                       |
| `text: DR`                        | The cell in the row that is exactly that text.     |
| `regex: '…'`                      | The first cell in the row matching the expression. |
| `left`, `right`, `above`, `below` | That many cells over.                              |

| Transform                     | Does                         |
| ----------------------------- | ---------------------------- |
| `date: dd/MM/yyyy`            | Reads a date in that format. |
| `number`                      | Reads an amount.             |
| `negate`                      | Flips an amount's sign.      |
| `trim`                        | Removes surrounding spaces.  |
| `replace: { from: a, to: b }` | Replaces every `a` with `b`. |
