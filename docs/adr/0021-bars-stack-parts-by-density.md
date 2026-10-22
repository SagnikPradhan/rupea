# Bars stack their parts by density

A bar chart shows how a total splits into parts, such as spending into the largest accounts under Expenses. It takes rows, `x` and `series` as [ADR 0014](0014-canonical-chart-series.md) has charts do, with one more role:

- **part**: a share of the bar's total, stacked in the order given from zero. Spending piles upwards and refunds downwards, each on its own side, so a bar can reach below the axis.

The total a bar adds up to is the primary. It has no series of its own: the page shows it as the headline figure, the hovered bar's or the whole range's.

Parts are told apart by density, never by colour, so colour keeps the meaning [ADR 0012](0012-brutalist-dense-design.md) gives it. The first part is solid ink, the next three are hatches from dense to sparse, and the last is sparse dots, which a page gives to whatever the others leave. Five parts are the most a reader can tell apart. A swatch drawn with the same pattern names a part wherever it appears, in the key under the chart or beside its account in a table, and pointing at a key entry fades the other parts.

uPlot lays bars over each other when it stacks them, which a hatch would let show through, so the chart draws each part itself, end to end with a hairline between, and keeps uPlot for the axes, the cursor and sizing.

## Considered Options

- **Grey steps**: one per part, but greys over a hatch blur together on a thin bar, and the muted greys are spoken for by text.
- **A palette of colours**: easiest to tell apart, but colour would mean an account here and a loss elsewhere.
- **uPlot's bands**: stacks with no drawing of our own, but fills overlap, and a hatch would show the parts below it.

## Consequences

- A chart with more accounts than five gathers the rest into one part, so the smallest stay readable only in the table.
- A page sends each bar's total beside its parts in the row, since a ledger knows it exactly and the chart would only add floats.
