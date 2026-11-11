# Names say what a function returns, and what its first argument is

Two developers pick the same name for a thing only about 7% of the time ([How Developers Choose Names, 2022](https://arxiv.org/abs/2103.07487)), so names drift unless a project agrees on how to build them. Rupea builds every function name the same way, so a newcomer can tell from the call what comes back and what goes in.

**Effects take a verb, pure functions a noun.** A function that reads or changes the outside world, such as the database, storage or the network, starts with a verb from [ADR 0016](0016-service-functions-names-and-shapes.md): `find`, `list`, `read`, `create`, `save`. A function without effects is named for what it returns, the way Swift's guidelines and Haskell's libraries do: `distance(to:)`, `length`.

**A pure name is the domain noun, then a preposition for its first argument.** The preposition reads as the label of what follows, as in `rowsFor(debts)` or `payoffOf(debts, on)`, and each one means one thing:

| preposition | the first argument is                 | example                         |
| ----------- | ------------------------------------- | ------------------------------- |
| `For`       | what the result is made for           | `rowsFor(debts)`                |
| `Of`        | what the result is a property of      | `payoffOf(debts, on)`           |
| `On`        | what something is charged or falls on | `monthlyInterestOn(loan, owed)` |
| `In`        | a span or list searched or filtered   | `bucketsIn(span, bucket)`       |
| `From`      | a source read or joined               | `debtsFrom(owed, terms)`        |
| `Over`      | a span something is spread across     | `dailyAverageOver(total, days)` |

Use the domain's own word before building one: `payoff`, not `paidOffMonth`. At most one qualifier, before the noun: `monthlyInterestOn`. A name that needs two is a sign the thing has its own word, or the function does two jobs.

**A few prefixes keep one promise each.** `is` and `has` return a boolean; `by` compares two values for a sort; `parse` reads text into a value; `print` writes exact text and `format` text for display; `to` converts with loss, as `toNumber` does. Arithmetic such as `sum`, `min`, `multiply` and `divide` keeps its plain name.

**Plural means an array.** A plural name returns an array, a singular one a value, or null when there is none to find. A mass noun such as interest may name an array that lines up one to one with an array passed in: `paidInterestOn(loan, owed, paid)` returns the interest in each payment of `paid`.

**Callers outside a module go through its namespace.** Pages import a helper module whole, `Liabilities.rowsFor(...)`, so the module names the area and two modules can share a name, such as `Loans.monthlyInterestOn` and `Liabilities.monthlyInterestOn`. Inside the module, siblings call each other by bare name.

**Important nouns go in the glossary.** Debt, due and schedule are defined there. A noun for a display shape, such as `rows` or `lines`, is the name of the prop it feeds.

## Considered Options

- **Every function a verb** (Kotlin): `buildRows`, `listDues`, `estimateInterest`. The verb is mostly `build` or `list`, so the noun after it does the work, and a call no longer shows whether it touches the outside world.
- **A noun with `Of` always**: `paidOffMonthOf`, `dailyAmountOf`. A forced suffix stacks words into names nobody would say.
- **Bare nouns through a namespace alone**: `Liabilities.rows(debts)` says where it lives, not what the rows are for.
- **Judging each name on its own**: what drifted here, since no two people judge alike.

## Consequences

- A lint rule warns on an exported function whose name follows none of these forms. It warns rather than fails, so names elsewhere change as their code is next touched.
- The prepositions and prefixes are a closed list. A new one comes here first.
