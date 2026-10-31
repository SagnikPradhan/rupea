# History before a range comes from monthly deltas

Holdings, net worth and balance assertions each need what accounts held before some day, which used to mean summing every posting since the ledger began. `monthly_deltas` stores what each account's counted postings of a commodity moved in each month, for every account type, so a balance on any day is the months before it plus at most a month of `daily_deltas`. Days stay exact; months are only where the sum starts.

`daily_deltas` stays a view because it is only ever read for a range, which an index bounds ([ADR 0019](0019-derive-what-is-cheap-store-what-is-not.md)). Monthly deltas are only ever read for all of history before a range, so as a view they would cost the scan they replace; they are worth something only when stored. A month does not depend on any other, so changing one rewrites only that month, and a rebuild of one ledger is one `group by`.

Postings carry their transaction's date, indexed after the account, because a month of one account's days had to go through transactions, and the planner sometimes read all of the account's postings for every month instead. A transaction's date never changes once written, so the copy cannot go stale. They carry whether it counts as well, so `daily_deltas` and balance checks read postings alone; `recount` is the one step that changes it, and sets both. This made a year of net worth 42 to 26 ms and a month of it 11 to 4 ms, and a full recheck of monthly assertions 106 to 74 ms over 20 years and 362 to 214 ms over 50.

Balance checks are worked out when settling and stored on each assertion's posting: what its account holds there, and the transactions that could fall either side. Only assertions from the month holding the earliest day a change touched are worked out again, from the months before it and one running total of the days after, so editing last month reads a month. Listing issues reads the stored results, and reports an assertion only where its error differs from the previous assertion's on the account, so one missing posting is one error, not one per later assertion. The unordered transactions are stored by id and named when listed, so a rename never leaves an old name behind.

Settling a change rewrites every month between the earliest and latest day it touched, old rows and new. Each settle also rebuilds the twelve months after the ledger's `checked_through` and moves it on, wrapping to the first month after the last, so a month left wrong by a bug is put right within a bounded number of settles at a bounded cost to each.

On the accounts benchmark, 20 years at ten transactions a day and 50 years at five to seven, with a monthly assertion on the bank, holdings went from 292 ms to 133 ms and from 397 ms to 268 ms. A month of net worth went from 312 ms to 133 ms and from 487 ms to 181 ms, and a year of it from 361 ms to 196 ms and from 528 ms to 239 ms. A sync with balance checks went from 293 ms to 205 ms, and stayed at 386 ms over 50 years.

On 20 and 50 years at ten transactions a day, with the bank asserted every month or every day, checking every assertion on each sync took 75, 230, 200 and 595 ms. Listing the stored results takes 14, 23, 14 and 36 ms. Settling an edit to the last month takes 2 to 3 ms, to a year ago 7 to 15 ms, and to the first year 105, 371, 373 and 1125 ms, which then reads every posting of the asserted accounts and writes every assertion whose result moved.

The running total is a window over the postings themselves, and an assertion's own day is looked up by its account and date. Joining the two through further CTEs left the planner guessing a row or two each, and its nested loops went quadratic in the number of assertions.

## Considered Options

- **Month-end balances**: one row per account before a range instead of a sum of months, but a change in an old month rewrites every later one, and each row depends on all earlier ones.
- **Daily balances**: no running total within a range, but as many rows as postings, and a change in an old day rewrites every later day. Net worth later adopted these as one row per year ([ADR 0030](0030-net-worth-from-year-rows.md)).
- **A materialized view, pg_ivm or Timescale continuous aggregates**: the database keeps the rollup, but a refresh recounts every ledger, pg_ivm locks the view until commit, and portable-pg ships no Timescale.
- **Triggers on postings and transactions**: no step can forget a month, but the date and whether a transaction counts live on transactions, and what writes the table would be invisible from the code that changes the ledger.
- **Rebuilding the whole ledger on every settle**: nothing to report and nothing to drift, but every save would scan all of history.
- **A daily background rebuild**: off the request path, but a second moving part before the first has shown it drifts.
- **Checking every assertion on each sync**: nothing stored, but the cost grows with history on every page view that lists issues.
- **Summing each assertion's own months and days**: the simplest query, and 3 times faster for monthly assertions, but every assertion reads its month again, which took 2.8 s on 50 years asserted daily.
- **Bisecting for the first failing assertion**: few reads, but an account can go off and come back, as a misdated transaction does, so a passing assertion says nothing about the ones before it.
- **Reading an asserted month's days through transactions**: no copy of the date, but which index the planner picks then depends on its statistics, and the wrong one cost 2 s on 20 years.

## Consequences

- Each step that changes transactions or whether they count reports the days it touched, or a month goes stale until the check comes round, and an assertion until a later change reaches it.
- A recount rewrites its transactions' postings too, or a posting counts when its transaction does not.
- A recount scattered across decades rewrites every month between.
- An edit to an old file works out every later assertion again, which costs about a second on 50 years asserted daily when every result moves.
