# Duplicates

The same money often reaches your ledger twice. A transfer from your savings account to your broker shows up on both statements. A statement imported twice repeats every transaction. Counting both would double the money.

Rupea doesn't delete either copy. It links them into a **group**: one transaction counts, and the others stay in their files as a record of what each statement said.

## Groups

A group is a line of metadata on each transaction in it. The one that counts, the **primary**, says `- group:`. The others, the **evidence**, say `- same-as:` with the same name.

```
2026-10-09 ACH-PPFAS-SIP
    - group: 2026-10-09-ppfas-brave-otter
    Assets:Investments:PPFAS   10,000.00
    Assets:Bank:HDFC
```

```
2026-10-09 Parag Parikh Flexi Cap SIP
    - same-as: 2026-10-09-ppfas-brave-otter
    Assets:Investments:PPFAS   10,000.00
    Assets:Bank:HDFC
```

Only the primary's postings count towards your accounts and spending. The evidence is kept as it was imported, so you can always see what each source reported.

A group is just text, so you can write one by hand, or undo one by deleting its lines.

## Finding duplicates

Open **Files**, then **Refine**, and choose a file. Rupea looks for transactions in other files that could be the same money. They must be on the same day, for the same amount, in the same bank, card or investment account. A transfer between two of your own accounts is matched differently, as the next section explains.

Each match shows both transactions side by side, with the line it would add to each:

- **Duplicate** when the descriptions are the same, as when a statement was imported twice.
- **Possible match** when they differ, as when two banks describe one transfer in their own words. Check these yourself.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/screenshots/refine-dark.png">
  <img class="frame" src="/screenshots/refine-light.png" alt="Two statements reporting the same salary, suggested as one group" width="2880" height="1800">
</picture>

For each match:

- **Accept** adds the group lines to both files.
- **Swap primary** picks the other transaction to count.
- **Dismiss** hides the match. It won't be suggested again.

**Accept all duplicates** accepts every match whose descriptions are the same, and **Accept all** accepts every match on the page.

## Transfers between your accounts

A transfer shows up on two statements, and each only knows its own side. The sending bank has a withdrawal, the receiving bank has a deposit, and neither says where the money went. Until it is linked, the withdrawal counts as spending and the deposit as income.

Rupea suggests a group when two transactions in different files have the same amount in opposite directions, on two of your accounts, up to two days apart. Both must still say `Unknown` or `Uncategorized` for the other side. A transaction you have already categorised is left alone.

When you accept, Rupea writes the other account in place of `Unknown` in both files, then links them like any other group:

```
2026-10-03 NEFT TO SBI
    - group: 2026-10-03-neft-brave-otter
    Assets:Bank:SBI            1,000.00
    Assets:Bank:HDFC
```

```
2026-10-03 NEFT FROM HDFC
    - same-as: 2026-10-03-neft-brave-otter
    Assets:Bank:HDFC          -1,000.00
    Assets:Bank:SBI
```

The money counts once, and neither spending nor income includes it. If only one statement is imported, there is nothing to match and the transaction stays as it is.

## When a group is wrong

A group needs exactly one primary. If it has none, or two, or a `same-as` with nothing to match, Rupea counts every transaction in it and lists the problem. It does this on purpose: a total that is too large is easy to notice, while money that quietly disappears is not.

## Importing the same statement again

Uploading the very same file twice does nothing. Adding transactions to a file that already holds them leaves the repeated ones out. So an overlapping statement, imported into the same file, only adds what's new. Groups are for what's left: the same money in different files.
