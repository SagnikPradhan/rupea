# Returns come from flows and net investment income

The accounts page shows each Assets account's [net in and XIRR](../../GLOSSARY.md) over the period picked. XIRR is a money-weighted return: the yearly rate at which the account's value at the start, its flows and its value at the end, each discounted from its own day, add up to zero. A period under a year shows the return over the period instead, as GIPS forbids annualising one.

Everything turns on what counts as a flow. A posting against another account is one, whether a balance account, Equity, salary from Income or spending to Expenses: it is money moved, not money made. Net investment income is the exception, postings from `Income:Interest` or `Income:Dividends` or to `Expenses:Fees`, at any depth below those names: it is what the account earned. So a PPF fed from the bank returns its interest rate, an EPF fed from salary returns its interest, a savings bank returns its savings rate, and `Assets` returns what everything earned, idle cash included. Brokerage lowers XIRR rather than reading as a withdrawal.

A transaction's net investment income goes to its Assets postings of commodities other than rupees, as those are what earned or cost it, or to its rupee ones when it has none. Several share it equally, the first in the file taking what does not divide, so the same files always give the same numbers, and no price is needed to split it. Parents add up the accounts under them, where moves between two cancel.

A posting is valued at its own price when it names one, as the rupees that left the bank are the truth, and at the latest price on or before its day otherwise, as worth does. An opening balance from Equity is a flow on its day at that price, since a lot opened without one costs nothing. Something with no price leaves XIRR empty and names the deepest account it reaches as an issue, as does a rate no amount of searching finds.

One query values every day's flows for the period, through the transactions index spending reads, and the start and end are holdings on those days. XIRR runs in TypeScript over the daily sums, by Newton's method from 10%, then by bisection when that strays below -100% or never settles. Nothing is stored.

On the accounts benchmark, 20 years at ten transactions a day and 50 years at five to seven, a month of returns takes 304 and 367 ms, the year so far 300 and 303 ms, a year 326 and 250 ms, and all of history 568 and 883 ms. Each includes checking the index, which alone takes 402 and 225 ms, so a period costs about what a month of net worth does, and only all of history reads enough to notice.

## Considered Options

- **All Income and Expenses as return**: no names at all, but salary would count as what a bank or EPF earned, and either would show hundreds of percent.
- **Accounts that hold lots only**: no names either, but a PPF, FD or EPF holds rupees and would have no XIRR.
- **Telling a savings bank from a deposit by its shape**, such as never paying an expense: no names, but an EPF fed from salary would still be wrong, and nothing would say so.
- **An account directive naming what an account earns**, as Beancount's beangrow configures each investment: exact, but new syntax every account needs before it shows anything.
- **Names tying income to one asset**, as Paisa reads `Income:Interest:{name}`: a dividend paid to the bank would reach the shares, but a misspelt name would silently give a wrong number.
- **Splitting income by value**: fairer between postings of different sizes, but it needs a price on the day, and moving shares between brokers is about the only time a transaction has two to split between.
- **Annualising every period**, as hledger's `roi` does: one number, but 2% over a month reads as 27%.
- **Time-weighted return**: independent of when money moved, but it needs a value on every day a flow happens.
- **Stored monthly flows**, as monthly deltas store balances: only worth it if reading all of history is slow.

## Consequences

- Interest named `Income:FD-Interest` counts as money put in, and the FD shows about 0%.
- A dividend paid straight to the bank counts towards the bank, and the account holding the shares returns a little less than it did.
- Tax deducted at source and booked to `Expenses:Taxes` is a withdrawal, not a cost.
- An account emptied during the period has no row on the page to show its return.
