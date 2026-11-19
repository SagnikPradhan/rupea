# A directive is a letter for one kind of thing

A ledger file holds transactions and a few lines that are not transactions: a price or a feed link (`P`), and an account's terms (`A`, [ADR 0034](0034-an-a-line-sets-up-an-account.md)). Budgets, goals and category rules are next, and each could take a letter. Choosing one at a time means the second guess contradicts the first, so the letters are settled here, before most of them are built.

A directive is a capital letter, then `*` or a date, then its subject, then its facts as dash lines ([ADR 0002](0002-dash-metadata-syntax.md)). A dated line overrides only the keys it names, from its day on.

```
B * Expenses:Food
- limit: 15000
```

## The rules

1. **A letter stands for one kind of thing, never for one setting.** `P` is a price, `A` is an account's terms.
2. **The letter is the initial of what it is.**
3. **Capital letters only, and none that `ledger` or `hledger` read as their own directive.** `ledger` reads `A`, `C`, `D`, `I`, `N`, `O`, `P`, `Y` and the lower-case `i` and `o`. Rupea already uses `A` its own way, and `P` as `ledger` does.
4. **A thing gets its own letter only when it has its own identity and its own period.** A fact about an account, such as a loan's rate or a card's limit, is a key on `A`.

## The letters

| Letter | Kind of thing                                         | Status                   |
| ------ | ----------------------------------------------------- | ------------------------ |
| `P`    | A price, or a link from a commodity to a feed         | Built                    |
| `A`    | An account's terms                                    | Built                    |
| `B`    | A budget ([ADR 0047](0047-a-b-line-sets-a-budget.md)) | Built with budgets       |
| `G`    | A goal: a target for an account's balance, by a date  | Reserved                 |
| `R`    | A rule that sets a category from a description        | Reserved, keys undecided |

The letters left over, which neither tool reads, are `E F H J K L M Q S T U V W X Z`.

Repeating payments have no letter and no syntax yet. They are to be found from a ledger's history first, and a loan or card already gives its schedule on its `A` line. If people later need to declare one, that is decided then.

Ledger-wide settings, such as the base currency, are not directives. They are metadata above the first transaction of `main.rupea`, the file the forms already write.

## Considered Options

- **hledger's `~` periodic form for budgets and repeating payments**: `hledger --budget` could read it, but a budget has no balancing side and needs an invented account, dated overrides have no home in it, and the metadata would be a second style next to dash lines.
- **Keys on the `A` line for everything**: no new letters, but one directive would mean accounts, budgets and goals, and `limit` would mean a card's credit limit and a budget's amount.
- **Words as directives, such as `budget`**: easier to guess than a letter, but `A` and `P` set the style, and a word costs a second syntax for the parser and for readers.
- **Deciding each letter when it is built**: nothing is promised early, but the second feature has to fit what the first one happened to take.

## Consequences

- `hledger` stops with `unexpected 'B'` on a file with a `B` line, as it does for `A` lines and `P` links. `ledger` ignores the line. A file that must open elsewhere keeps its `A`, `P` and `B` lines in a file of their own.
- A reserved letter is a promise. `G` and `R` are not read until their features are designed, and a line starting with one is reported as a line that does not read.
- A new kind of thing is checked against rule 4 before it takes a letter. If it fits an existing directive's subject, it is a key there.
