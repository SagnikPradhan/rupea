# Importing statements

Importing turns a statement from your bank, card or broker into transactions in your ledger. Rupea reads the statement into a draft, you check the draft, and only then does it count.

## What you can upload

Open **Files**. In the **Import statements** panel next to your files (below them on a narrow screen), drop your files on it or click it to choose them. You can add several files at once:

- **Statements** as PDF, CSV, XLS or XLSX.
- **Ledger files** you already keep, as `.rupea`, `.ledger`, `.journal`, `.dat` or `.txt`. They import as they are written, with no schema. They must be UTF-8, and `include` lines in them aren't followed.

Uploading a file Rupea already has does nothing, so you can't import the same statement twice by accident.

If a PDF or spreadsheet has a password, Rupea asks for it. It keeps the unlocked copy, so it never asks again for that file, and it never stores the password.

## How Rupea reads a statement

Rupea reads statements in the background, so you can keep working while it does. It first turns the statement into a grid of rows and columns, like a spreadsheet. For a PDF, it finds the tables on each page and lines up their words.

Then it looks for the one schema that fits the statement. A schema says how to recognise a kind of statement, which account it belongs to, and where each transaction's date, amount and description are. Rupea tries your ledger's schemas first, and its built-in ones only when none of yours fit. It never guesses: if no schema fits, or more than one does, it tells you why and waits.

Rupea ships schemas for:

- HDFC Bank savings accounts and credit cards
- IDFC FIRST Bank credit cards
- State Bank of India savings accounts

For any other statement, it shows the statement beside a **Schema** to fill in. Flip the statement between the original file, the grid Rupea reads and the transactions it finds, and the transactions update as you type. [Writing schemas](schemas.md) shows how. You write a schema once for each bank and layout, and every statement like it imports by itself from then on.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/import-dark.png">
  <img class="frame" src="/screenshots/import-light.png" alt="A statement Rupea doesn't know yet, shown as a grid to describe" width="2880" height="1800">
</picture>

## Checking the draft

The transactions Rupea finds show in a list, with the account they belong to. Each moves money into or out of the statement's account, and Rupea suggests the other account, such as `Expenses:Food`, from the transactions already in your ledger.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/import-draft-dark.png">
  <img class="frame" src="/screenshots/import-draft-light.png" alt="Ten transactions read from a savings statement, each with an account" width="2880" height="1800">
</picture>

- **Continue to review**, on the step before, makes the draft from what Rupea found. It is available once Rupea has found something. In the draft, choose any transaction in the list to fix its account or description in a form beside it, or switch the draft to Text to edit it as written. Grid shows the sheet you uploaded, as Rupea read it, and Original shows the file itself (a PDF in the page, any other file to download), to check the draft against.
- **Delete** throws the draft and your edits away, and reads the statement again. A draft is a file marked Not counted, so it has the same buttons as any file (All files, Save and Format in Text, Delete).
- **Check for matches** at the bottom opens the review of possible matches for the draft.
- **Add transactions to ledger**, also at the bottom, opens a dialog that asks for a file to add the transactions to. Type a new name, or choose a file already in the ledger from the list.

Adding to a file you already have puts the transactions in by date. It leaves out any the file already holds with the same date, description, account and amount, so adding an overlapping statement only adds what's new. A new name makes a new file.

When it is added, the last screen says what was added and where. **Undo** puts it back in review, **Open** shows the file, and **Import another** goes back to your files.

## Where statements and drafts are kept

Until you add them to the ledger, uploads and drafts wait in the review area, the `_/` folder of your files:

- a statement under the day you uploaded it, as `_/20261028/savings-oct-2026.pdf`, and
- its draft beside it, with `.rupea` added, as `_/20261028/savings-oct-2026.pdf.rupea`.

Nothing under `_/` counts: its transactions don't show in your accounts, and its balances aren't checked.

Every file made from a statement records the statement's checksum at the top, as `- checksum: …`. That is how Rupea knows which statement a file came from, even after you rename or move either one.

## Balances

When a statement prints a running balance, the import writes it on each transaction as `= 2,51,869.10`, after the amount. Rupea checks every balance against your ledger, and warns you where they differ, which is usually a missing or doubled transaction. A warning never stops you saving.
