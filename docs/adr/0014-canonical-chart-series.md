# Charts take rows and name their series by role

A chart takes the rows an endpoint returns, unchanged, and names the fields it plots the way a `LedgerTable` names its columns: `rows`, the field `x` holding each row's ISO day, and `series` of `{ key, label, role }`. Endpoints send what is true about the ledger, with exact decimal amounts, and never shape data for a chart.

A series' role says what it means, and the chart alone decides how it looks:

- **primary**: the one measure the chart exists for, drawn thick in ink. The page shows its value as the headline figure, so the caption leaves it out. A chart has at most one.
- **context**: what explains the primary, such as assets beside net worth. Thin and muted.
- **reference**: what the primary is weighed against, such as what is owed, a target or a budget. Thin, muted and dashed.

A chart has one `unit`, `amount` or `percent`, which formats its axis and caption. The headline is a `summary` snippet the chart renders with the row under the cursor, so the cursor has one owner.

## Considered Options

- **Per-line style flags (`ink`, `faint`, `dashed`)**: pages chose strokes, so two charts could draw the same meaning differently.
- **Endpoints returning chart-shaped series**: ties the server to one view of the data.
- **A bound or reported cursor index**: two owners of one cursor, and binding a prop needs a `let`.

## Consequences

- A new chart kind, such as bars for spending, takes the same rows, `x` and `series`.
- A fourth role needs a reason a primary, context or reference cannot give.
