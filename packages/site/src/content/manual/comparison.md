# Rupea and other apps

There are good tools for keeping track of money. This page says where Rupea differs from them, and where they are still the better choice.

## Plain-text accounting

[ledger](https://ledger-cli.org), [hledger](https://hledger.org) and [Beancount](https://beancount.github.io) keep money as double-entry text files, as Rupea does. They are mature, fast and well documented, and have years of tools around them.

Rupea differs in three ways:

- **It is a web app first.** Those tools are run from a terminal, with web views such as [Fava](https://beancount.github.io/fava/) on top. In Rupea, charts, lists, importing and editing are all in the browser.
- **It reads statements as they come.** Those tools import CSV through rules or code you write. Rupea reads PDFs too, finds their tables by itself, and ships schemas for Indian banks.
- **It is built for India.** Rupees are the default, dates are read day first, and prices for Indian mutual funds come from mfapi.

Choose one of them if you want a proven tool today, or need reports Rupea doesn't have yet. Moving later is easy both ways: Rupea's format is close to ledger's, and imports `.ledger` and `.journal` files.

## Budgeting apps

[Actual](https://actualbudget.org) and [Firefly III](https://www.firefly-iii.org) are open source apps you can run yourself. Actual is built around a budget for every category, and Firefly III around rules and reports. Both keep your data in a database.

Rupea keeps it in files instead. You can read them without Rupea, keep them in version control, and nothing is lost if Rupea goes away. Rupea is also stronger on investments: lots, gains, prices and the return on each account.

Choose Actual or Firefly III if budgets matter most to you now. Rupea has no budgets yet.

## Indian money apps

Many apps in India read your bank SMS, or connect to your accounts through the Account Aggregator network. They need no setup, and work on your phone.

Rupea asks more of you, since you upload statements yourself. In return, your data stays in files you own, on storage you choose, and the code is open for anyone to read. Nothing is sent to a company you didn't pick.

Choose one of them if you want something that works by itself on your phone today. Rupea has no phone app yet.

## Not ready yet

Rupea is a work in progress. It has no budgets, bill reminders or phone app, and no hosted version you can sign up for. The [roadmap](roadmap.md) lists what's done and what's next.
