# Research

What we know about the people Rupea is for, how strongly, and where it came from. Findings come first, grouped by question. Each cites the sources at the end by name. `/pm research` adds to it one question at a time.

## Gaps

These would change the personas if closed. Close them before giving a weak persona real work.

- **The general public.** Nearly all comments come from investing and personal finance subreddits. r/india, the city subreddits, r/IndiaTax, r/CreditCardsIndia and r/TwoXIndia were not sampled.
- **Caretaker.** Family threads were picked for the topic and skew to conflict. No survey sizes the need for a tool.
- **Money in two countries.** Vendor pages only.
- **Willingness to pay.** Competitor prices are known, but few rupee amounts come from users, and how many pay for tracking is unknown.
- **App reviews.** About 80 low-rated Play Store reviews per app, newest first. No App Store reviews, and none at all for Copilot.
- **Competitor prices.** ET Money, Kuvera, Value Research and Lunch Money prices are snippets only.
- **Plain-text and self-hosted users.** Their complaints come from GitHub issue titles, not users. No Indian user of Paisa, hledger or Firefly was found.
- **Plain text as a ramp.** No evidence either way. Only talking to people who try it will tell.
- **Coding.** Personas and comfort with technology were inferred from short comments by an agent, partly by regex.

## Next questions

Sorted by how much the answer would change the roadmap. `/pm research` takes the first.

1. Would people pay for hosting and sync, and how much? Fold charges ₹1,499 to ₹2,999 a year, and Monarch users ask for a cheaper tier. It decides whether hosting pays, and which plans to build.
2. How do people outside the investing forums keep track, such as r/india, the city subreddits and r/CreditCardsIndia? It tests whether the Tracker and Investor hold for the wider public.
3. What do people leaving Kuvera need first, after tax harvesting and goals? It could move the Investor's import and returns work up.
4. Do Indian users of Paisa, hledger or Firefly exist, and why did they pick them? It tests how Bookkeepers arrive.
5. Does seeing the lines a form wrote make plain text feel easy? It tests the ramp, and only talking to people who try it will tell.
6. How many people keep track for a partner or parents, and what do they need? It decides whether the Caretaker gets work.

## Findings

### How people track

| Method | Enthusiasts | r/personalfinanceindia |
|---|---|---|
| Manual app (Money Manager, Wallet, Cashew) | 28% | 33% |
| Spreadsheet | 22% | 27% |
| Card or bank statement as the log | 6% | 12% |
| Do not track | 3% | 11% |
| Aggregator (Fold, INDmoney, Fi) | — | 10% |
| SMS-reading app | 27%, many posted by the app's makers | 8% |
| Notes, paper or WhatsApp | 3% | 5% |
| Plain text or GnuCash | 3% | 1% |

- Manual apps and spreadsheets lead in both crowds. Spreadsheets cluster among people tracking investments.
- About one in ten already use the card or bank statement as their log, and review it monthly: "Once a month ... I go through all the transactions, classify them by category. ... Takes like 20 minutes total." ([comment](https://reddit.com/comments/kblqde/_/gfivy6f))
- Excel is the most used tracking tool, and few track regularly (D91).

### What they track

- Spending far more than net worth: 86 to 18 comments among enthusiasts, 180 to 38 in r/personalfinanceindia.
- Investments are tracked from CAS statements and spreadsheets: "Investments, i track using monthly NSDL CAS statement." ([comment](https://reddit.com/comments/18bgshh/_/kcck02b))
- EPF, PPF and NPS are typed in by hand: "No way to track PPF, NPS, EPS... All goes manually in the spreadsheet." ([snippet](https://reddit.com/r/developersIndia/comments/v43xrz/))
- 21% of investors find tracking performance hard (SEBI).

### Why they quit

1. **Effort.** Typing every expense wears off: "I'm tired of tracking. Can't keep up with excel. I've given up." ([comment](https://reddit.com/comments/1d16mtr/_/l5wr17a)) D91 heard the same: "I had to manually add everything. Eventually uninstalled."
2. **Broken capture.** SMS apps miss or double transactions: "Almost all online transactions are captured twice or sometimes even 5 times." (axio review)
3. **Apps that change.** Sold, shut down, redesigned or paywalled: Kuvera after CRED, ET Money, Perfios PFM. "It was a perfect, user friendly and useful UI until the Cred update came." (Kuvera review) About 45 of Kuvera's 80 newest low reviews blame the redesign. Fold moved export behind its paywall: "It's my own bank data."
4. **Apps that sell to them.** axio turned to lending (about 15 of 80 low reviews are loans or collections), INDmoney to marketing calls and loan spam, ET Money to hidden commission.
5. **Lost data.** Backups and restores that lose data are the worst failure of manual apps (Money Manager, about 6 of 80). One axio user lost 11 years after a phone change.

Some stop happily once saving is automatic, and spend the rest. Many outgrow apps and settle on sheets: "I always came back to Sheets because I didn't want my data locked in someone else's database." ([comment](https://reddit.com/comments/pphbgp/_/ogq8nyl))

### Privacy

- SMS access splits people almost evenly: about 12 to 12 among enthusiasts, 38 accept to 27 refuse in r/personalfinanceindia.
- Those who refuse type expenses in by hand, then quit (D91).
- Account aggregators are barely mentioned, and a post asking whether people trust them scored 33 up and 19 down.
- Privacy is a minor reason people leave: about five of some 1,000 low-rated reviews across ten apps. It keeps some people away, but it is not why people leave.

### Devices and paying

- Phone in 106 of the 165 who said, laptop in 40, both in 19.
- They pay small one-off or lifetime amounts. Fold's price was called steep. It is now ₹2,999 a year with a ₹49,999 lifetime plan, not the ₹999 seen earlier. One person paid ₹499 a year for backup and export. Abroad, YNAB charges $109 and Monarch $99.99 a year, and price is their second complaint after broken bank sync.

### Families

- 70% are personally or jointly responsible for household money, more among the young (NCFE). 71% of women and 66% of men say money is decided jointly (NFHS-5).
- Couples share money in many ways, so no single rule fits:

| Rule | Comments |
|---|---|
| Split by Splitwise, evenly or by income | 14 |
| Pool everything | 8 |
| Joint but log every rupee | 7 |
| Joint pot plus own accounts | 6 |
| Pool plus an allowance each | 2 |

- With parents, people keep their own money private (8 never tell), send money (6), or manage their parents' investments (6). Some regret being open: "now its like I dont own the money I made." ([comment](https://reddit.com/comments/1w9jebp/_/p8c0aa8))
- A sheet doubles as a guide for family: "And also use it as a guide for my family if something happens to me." ([comment](https://reddit.com/comments/1rpo5y4/_/o9md8gt))
- Among enthusiasts, family money almost never comes up.

### Who invests

- 9.5% of households hold any market product: 23% in the top nine metros, 23% of salaried households, 6% rural (SEBI).
- 3% hold shares, and 88% save cash at home (NCFE).
- Under-30s are 56% of new investors in 2025, and the median investor is about 33 (NSE and AMFI, snippet).

### Others in the space

Many small open-source CAS parsers and offline statement readers exist, such as [cas-portfolio](https://github.com/prsurve/cas-portfolio) and [kharchalens](https://github.com/aakraj/kharchalens). Parsing CAS alone does not set Rupea apart. Paisa is the closest competitor: ledger-based and built for India, but people add data by editing the ledger, and setup and returns are its open pains. See `competitors.md`.

## Sources

All gathered on 2026-10-29. Reddit comments came from the Arctic Shift archive; raw comments are not kept in the repo.

| Source | What | Size |
|---|---|---|
| Enthusiasts | r/IndiaInvestments threads from 2020 to 2024, plus the FIRE and mutual fund subreddits. Coded by regex and reading; labels overlap. | 837 comments, 162 coded |
| r/personalfinanceindia | 48 threads, mid-2023 to October 2026. Wider and younger than the enthusiasts. Coded by hand. Includes four couples threads, one viral, and four parents threads picked for conflict. | 2,351 comments, 312 coded |
| [D91 Labs survey](https://medium.com/91-labs/personal-finance-survey-2020-expenses-savings-investments-39aab0aa37aa) | April 2020, self-selected and urban, 79% millennials | 452 people |
| [NCFE 2019](https://ncfe.org.in/wp-content/uploads/2023/12/NCFE-2019_Final_Report.pdf) | Financial literacy and inclusion survey, pages 39 to 47 | 75,000 adults |
| SEBI Investor Survey 2025 | Pages 38 to 39 and 60 | 91,950 households |
| NSE, AMFI and NFHS-5 | Search snippets only | — |
| Play Store reviews, first look | axio, Money Manager, Kuvera, ET Money, Fold | 4 to 10 per app |
| Play Store reviews, competitors | Newest 1, 2, 4 and 5 star reviews of ten apps, India and abroad | about 1,500 reviews, 80 low-rated per app |
| Competitor threads | Eight r/personalfinanceindia threads on Kuvera, Fold, axio and Money Manager, and one r/MonarchMoney thread on price | about 270 comments |
| GitHub issues | Paisa (82 coded), hledger, Fava, Firefly III and Actual | about 100 titles |
| Product pages | Pricing and feature pages for YNAB, Monarch, Copilot, Fold and Actual | read |
| Search snippets and blogs | Thread titles and vendor posts, from before comments could be read. Leads, not evidence. | — |
