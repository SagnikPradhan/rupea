# Spending is one query by account and bucket

The expenses page answers where money went over a range and how that changed. One query adds up counted Expenses postings by account and [bucket](../../GLOSSARY.md), each amount valued in rupees at the latest price on or before its own day, as net worth values a day. The bucket follows the range: days for a month, months for a year, and years for all of history, so the rows stay few however long a ledger runs.

The rows answer both views. The server rolls each account into its parents, exactly in ten-billionths, since that work grows with the accounts rather than with history, and sends every account's total beside its buckets. The tree reads the totals; a bar is the Expenses account's bucket, and one account's buckets are its share of every bar. Bars start at the first bucket with spending, as all of history starts long before a ledger does. The range before, as long or as far into its year, is the same query over other days, read alongside so the page can weigh one against the other; all of history has none before it.

The query starts from the transactions in the range through the index lists already page by, then reaches their postings, so nothing new is indexed for it.

## Considered Options

- **A stored daily total per account**: reads stay flat as history grows, but every settle must rewrite it and prices that arrive late must revalue it. Kept for when a measured query is slow.
- **Grouping sets of account and of bucket**: fewer rows, but the chart could no longer show one account's bars without asking again.
- **Valuing at today's price**: one lookup per commodity, but a trip abroad years ago would change cost with the exchange rate.
- **Days as the bucket for every range**: one shape, but decades of days are tens of thousands of bars.

## Consequences

- A refund lowers its account's spending, so an account or a bar can come out below zero.
- The previous range's rows cost a second pass over its days.
- An amount with no price for its day counts as unpriced, even when a later price exists.
