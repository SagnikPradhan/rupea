# A bare amount is in the ledger's base

An amount written without a currency is in the ledger's base. The base is file metadata at the top of `main.rupea`, so it lives with the rest of the ledger's text, as terms and budgets do ([ADR 0034](0034-an-a-line-sets-up-an-account.md), [ADR 0047](0047-a-b-line-sets-a-budget.md)):

```
- base: USD

2026-08-29 Lunch
	Expenses:Food  12.00
	Assets:Bank
```

A ledger whose `main.rupea` names no base is in INR, so every ledger written before this reads as it did. The base is a three-letter code as ISO 4217 writes them, in any case; anything else is a problem on its line and leaves the base as it was.

## Changing the base

Changing the base relabels every bare amount and converts nothing. A written currency keeps its meaning, so `20 INR` stays rupees in a ledger based in dollars. A base picked wrongly at the start is fixed by one line, and a ledger reads cleanly in its own currency.

Postings store the commodity the parser resolved, so queries compare to a value and never to a rule. Sync copies the base to the ledger's row. When it changes, every file is read again in the new base and everything worked out from them is settled again. The base is part of each transaction's hash beside the date formats, so nothing read in the old base is kept. A switch is rare, so its cost is fine.

The printer leaves out the base and writes every other currency, so a file Rupea writes reads back the same.

## Valuing and showing

Net worth, costs, lots and returns are reached in the base, so a ledger based in dollars values rupees by their price. A price feed still quotes in its own currency, so mfapi's NAVs stay rupees.

Settings writes the base line into `main.rupea` like any edit. It offers only the currencies a chain of the ledger's own prices links to the base, so the ledger can still be valued after the switch. The file may name any other, and then what has no price shows as unpriced.

Numbers are written the way the base currency's country writes them: 12,34,567 for INR, 1,234,567 for USD, EUR and GBP, and as in the US for a currency with no country set. Dates follow the same locale, so a USD ledger reads Jan 2, 2026 where an INR one reads 2 Jan 2026. The web app's endpoints hand amounts on with their commodities, and the pages print and format them in one place, the formats of the ledger's base, leaving out the base and naming every other currency.

## Considered Options

- **A bare amount is always INR**: nothing is ever read again, but a ledger kept abroad writes its currency on every line.
- **Switching rewrites bare amounts with the old currency**: values never change meaning, but every file is rewritten, and a base picked wrongly at the start cannot be fixed by relabelling.
- **The base in a settings table**: one more place for what the files can say, and an embedded ledger copied elsewhere would lose it.
