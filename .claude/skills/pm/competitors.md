# Competitors

What people use instead of Rupea, and what Rupea could do better. Each entry says when it was last checked. `/pm research` refreshes the oldest first.

Doing what a competitor does is not a reason to build. An idea that a competitor already has earns a place in the roadmap only when Rupea can do it better on a frustration from `person.md`.

Counts come from the newest 1 and 2 star Play Store reviews, about 80 per app, coded by regex and reading. They overlap and are approximate.

## Better than everyone

What no competitor does well, and Rupea could.

- **Any statement, no logins.** Work from the statement people already have, for any Indian bank or broker, with no SMS and no bank login. Aggregators fail on SBI, Kotak and IDFC (Fold, 14 of 71). SMS apps miss or double count (axio, 16 of 80). Bank sync abroad breaks (Monarch, 15 of 80). Tracker, Investor.
- **Data no one can take away.** Plain files outside the app, so a sale, redesign or paywall cannot take them. Fold paywalled export, axio users lost years of data, Money Manager restores lose data, and Kuvera's redesign drove 45 of 80 low reviews. Investor, Tracker, Bookkeeper.
- **Count once, and show why.** Link duplicates across statements and explain each link. Double counting is named for axio and for Value Research's CAS import, where a wrong holding cannot be deleted. Tracker.
- **Returns that are right.** Correct returns from lots, cost and prices. Kuvera showed a 400% XIRR, and 18 of Paisa's 82 open issues are calculations. Investor.
- **Paid for by the people it serves.** No loans (axio, INDmoney), commission (ET Money) or ads (Money Manager, Fold's free tier). Investor.
- **Plain text that is easy to start.** About 26 of Paisa's 82 open issues are install and setup, and hledger and Fava have no statement import. A form and an import that show the lines they wrote has no direct rival. Bookkeeper, Tracker.
- **A first import that pays off in minutes.** Fold's five-minute setup is what its fans praise. A first statement that ends in a net-worth chart can match it. Tracker.

Pricing ideas from abroad, for later: a trial with no credit card (YNAB), a cheaper tier that only tracks (a Monarch thread asking for one scored 74), one plan shared by up to six people (YNAB), free self-hosting (Actual), and a lifetime option (Cashew, Fold).

## In India

Apps that Indian users name in the research.

| Name | Kind | Checked |
|---|---|---|
| Kuvera | Investments, sold to CRED | 2026-10-29 |
| INDmoney | Investments and spending, aggregator, broker | 2026-10-29 |
| ET Money | Investments | 2026-10-29 |
| Fold | Spending, aggregator | 2026-10-29 |
| axio | Spending from SMS, lender | 2026-10-29 |
| Money Manager | Spending, manual | 2026-10-29 |
| Cashew | Spending, manual | 2026-10-29 |
| Value Research | Investments | 2026-10-29 |

## Plain text and self-hosted

| Name | Kind | Checked |
|---|---|---|
| hledger and Fava | Plain-text ledgers and their web views | 2026-10-29 |
| Paisa | Plain-text ledger, built for India | 2026-10-29 |
| Firefly III | Self-hosted, database | 2026-10-29 |
| Actual Budget | Self-hosted budgeting | 2026-10-29 |

## Abroad

For ideas on design and pricing, not direct competition.

| Name | Kind | Checked |
|---|---|---|
| YNAB | Budgeting | 2026-10-29 |
| Monarch | Spending and net worth | 2026-10-29 |
| Copilot | Spending and net worth | 2026-10-29 |
| Lunch Money | Spending, for people who like control | 2026-10-29 |

## Entries

### Kuvera · checked 2026-10-29

- **Does well:** before CRED, direct mutual funds, goals, family accounts and free tax harvesting.
- **Complaints:** of 80, about 45 blame the redesign or lost features, 12 login or OTP loops, 7 slow support, 5 forced WhatsApp or phone OTP. "Cred killed Kuvera. Where are you moving to?" scored 75 with 90 comments; people moved to MFCentral, Coin and INDmoney, and miss tax harvesting most. Its newest 5-star reviews look templated.
- **Price:** free for direct funds (snippet).
- **Rupea is better at:** no owner who can change it, files people keep, CAS import.
- **Rupea is worse at:** no buying funds, no tax harvesting, no goals.
- **Sources:** Play Store; r/personalfinanceindia [1shy50i](https://reddit.com/comments/1shy50i), [1ucmqu9](https://reddit.com/comments/1ucmqu9), [1u1t2vi](https://reddit.com/comments/1u1t2vi).

### INDmoney · checked 2026-10-29

- **Does well:** Indian and US stocks, funds, IPOs and net worth in one app, with family accounts. 4.56 from 464,088 ratings.
- **Complaints:** of 80, about 16 bugs (mostly trading), 8 marketing calls, loan spam and notifications, 6 ignored support, 5 hidden charges. Reddit calls the UI messy, but sees few alternatives.
- **Price:** free to track; brokerage and forex markup on US stocks (snippets).
- **Rupea is better at:** no sales funnel, works from statements, keeps the history.
- **Rupea is worse at:** buying US stocks, live holdings through aggregators, FDs.
- **Sources:** Play Store; indmoney.com; snippets.

### ET Money · checked 2026-10-29

- **Does well:** direct funds, SIP tracking, a clean interface. 4.42 from 233,458 ratings.
- **Complaints:** of 80, about 8 no support, 7 direct plans switched to regular or hidden commission, 6 the new UI, 4 basics behind Genius, 3 forced updates. "User since 2015, app went downhill, most features paid."
- **Price:** Genius about ₹3,499 a year (snippet, may be old).
- **Rupea is better at:** no commission, no paywall on returns.
- **Rupea is worse at:** cannot buy funds or run SIPs.
- **Sources:** Play Store; [1u1t2vi](https://reddit.com/comments/1u1t2vi); snippets.

### Fold · checked 2026-10-29

- **Does well:** account aggregator for banks, cards, funds, stocks and EPF, "no SMS scraping". Setup in five minutes, a responsive team. 4.63 from 1,428 ratings.
- **Complaints:** of 71, about 14 bank fetch failures (SBI, Kotak, IDFC), 9 paywalls, 8 crashes or OTP, 5 missing auto-tagging. Three call export behind the paywall a dealbreaker: "It's my own bank data."
- **Price:** free with ads and five refreshes a month. Plus is ₹2,999 a year (early bird ₹1,499 to ₹2,009), lifetime ₹49,999. Export, tags and the web app are paid.
- **Rupea is better at:** any bank through statements, full history, free plain-text export, no ads.
- **Rupea is worse at:** no automatic sync.
- **Sources:** [fold.money blog](https://fold.money/blog/price-of-free-software); Play Store; [1wftl9f](https://reddit.com/comments/1wftl9f).

### axio · checked 2026-10-29

- **Does well:** reads bank and card SMS into spending, with UPI and card due dates. 4.46 from 265,949 ratings.
- **Complaints:** of 80, about 16 SMS missed or doubled, 15 loans, collections or upsell, 12 support. On Reddit, one person lost 11 years of data after a phone change, export fails, and the tracker is "dead now".
- **Price:** free; it earns from lending.
- **Rupea is better at:** no SMS, no lending, files people own, duplicates linked.
- **Rupea is worse at:** no automatic capture, no phone app.
- **Sources:** Play Store; [1tbvevq](https://reddit.com/comments/1tbvevq), [1v7wf8l](https://reddit.com/comments/1v7wf8l), [1uukm64](https://reddit.com/comments/1uukm64).

### Money Manager · checked 2026-10-29

- **Does well:** free, flexible categories and accounts, a one-time purchase to remove ads. 4.64 from 468,167 ratings.
- **Complaints:** of 80, about 10 ads or a remove-ads purchase tied to one Google account, 6 backup or restore losing data, 3 unreliable PC sync, 3 data collection.
- **Price:** free with ads; ₹99 to ₹1,800 in the app.
- **Rupea is better at:** imports instead of typing, files as the backup, net worth.
- **Rupea is worse at:** quick entry on a phone for cash and small payments.
- **Sources:** Play Store; [1utthyk](https://reddit.com/comments/1utthyk).

### Cashew · checked 2026-10-29

- **Does well:** free, no ads, very customisable, a lifetime option. 4.89 from 28,109 ratings. Open source (GPL-3.0), CSV and Sheets import, a web app.
- **Complaints:** of 80, about 8 lag or updates that broke the UI, 7 want bank capture, a few failed imports or restores.
- **Price:** free; ₹150 to ₹1,950 in the app, including lifetime Pro.
- **Rupea is better at:** statement import, duplicates, investments.
- **Rupea is worse at:** polish on a phone, a native app.
- **Sources:** Play Store; [github.com/jameskokoska/Cashew](https://github.com/jameskokoska/Cashew).

### Value Research · checked 2026-10-29

- **Does well:** trusted fund ratings and portfolio tracking. 4.66 from 16,896 ratings.
- **Complaints:** of 80, about 8 slow, 6 subscriptions that re-ask or auto-debit, 3 CAS imports that double count or leave wrong holdings that cannot be deleted.
- **Price:** Fund Advisor about ₹4,999 a year (snippet).
- **Rupea is better at:** free, duplicates handled, holdings people own.
- **Rupea is worse at:** no research, ratings or advice.
- **Sources:** Play Store; snippets.

### hledger and Fava · checked 2026-10-29

- **Does well:** a precise plain-text format, a strong community, web views. hledger 4.8k stars (GPL-3.0), Fava 2.6k (MIT), both active.
- **Complaints:** from issue titles, not users: unrealised gains, arithmetic in amounts, packaging, envelope budgeting in Fava, a hosted image. No statement import.
- **Price:** free.
- **Rupea is better at:** statement import, duplicates, categories, Indian funds and shares, a form instead of hand-written lines.
- **Rupea is worse at:** years of format coverage, community and tools.
- **Sources:** [hledger](https://github.com/simonmichael/hledger), [Fava](https://github.com/beancount/fava).

### Paisa · checked 2026-10-29

The closest competitor.

- **Does well:** ledger-based and built for India: fund and NPS prices, capital gains and tax harvesting. 3.2k stars, AGPL-3.0, v0.7.8 on 2026-10-21.
- **Complaints:** of 82 open issues, about 26 install, Docker or setup, 18 calculations (lot prices ignored, FIFO), 13 import (CAS, CSV), 6 NPS or price fetching. People add data by editing the ledger.
- **Price:** free.
- **Rupea is better at:** statement import without hand-written lines, duplicates, an easier start in the browser.
- **Rupea is worse at:** Paisa already reports tax harvesting and NPS.
- **Sources:** [github.com/ananthakumaran/paisa](https://github.com/ananthakumaran/paisa).

### Firefly III · checked 2026-10-29

- **Does well:** self-hosted, rules, recurring transactions, many currencies, an API. 25k stars, AGPL-3.0, active.
- **Complaints:** from issue titles: bank import, OFX, CSV options, linking transactions, merging accounts. The importer is a separate app.
- **Price:** free.
- **Rupea is better at:** import, duplicates, investments, files instead of a database.
- **Rupea is worse at:** API, rules, maturity.
- **Sources:** [github.com/firefly-iii/firefly-iii](https://github.com/firefly-iii/firefly-iii).

### Actual Budget · checked 2026-10-29

- **Does well:** fast, local-first, offline, optional end-to-end encryption, self-hosted, imports from YNAB. 29.8k stars, MIT.
- **Complaints:** from issue titles: bank sync providers, currency symbols, reports. Sync covers the US and Europe only.
- **Price:** free; paid hosting through PikaPods.
- **Rupea is better at:** Indian PDF statements, investments, text files.
- **Rupea is worse at:** budgeting, polish, offline sync.
- **Sources:** [actualbudget.org](https://actualbudget.org), [GitHub](https://github.com/actualbudget/actual).

### YNAB · checked 2026-10-29

- **Does well:** a budgeting method people say changes how they see money. One plan shared by up to six people. Good support.
- **Complaints:** of 80 (3.5 from 25,416 ratings), about 10 price, 10 broken bank sync, 8 updates that broke a workflow.
- **Price:** $109 a year. A 34-day trial with no credit card. Free for students for a year.
- **Rupea is better at:** cost, Indian banks, investments.
- **Rupea is worse at:** budgeting and goals.
- **Sources:** [ynab.com/pricing](https://www.ynab.com/pricing); Play Store.

### Monarch · checked 2026-10-29

- **Does well:** clean dashboards for spending and net worth, quick linking, listens to feedback.
- **Complaints:** of 80, about 15 bank disconnects, 6 against paying, 3 against a card for the trial. A thread asking for a cheaper tier scored 74.
- **Price:** $99.99 a year.
- **Rupea is better at:** cost, India, no aggregator.
- **Rupea is worse at:** polish, automatic sync, a phone app.
- **Sources:** [monarch.com/pricing](https://www.monarch.com/pricing); Play Store; [r/MonarchMoney](https://reddit.com/comments/1x0pmqq).

### Copilot · checked 2026-10-29

- **Does well:** design, an Apple Design Award finalist. One plan, no tiers.
- **Complaints:** snippets only: no Android app, household sharing still coming.
- **Price:** $109 a year.
- **Rupea is better at:** cost, India, openness.
- **Rupea is worse at:** design polish.
- **Sources:** [copilot.money](https://copilot.money); snippets.

### Lunch Money · checked 2026-10-29

- **Does well:** snippets only: control, many currencies, an API, liked by developers.
- **Complaints:** snippets only: weak phone app, bank connections.
- **Price:** about $100 a year (snippet).
- **Rupea is better at:** India, statements, investments.
- **Rupea is worse at:** currencies, API.
- **Sources:** snippets only; the site returned 403.
