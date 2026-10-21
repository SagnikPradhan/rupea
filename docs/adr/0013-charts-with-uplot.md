# Charts with uPlot, valued in Postgres

Charts are drawn with [uPlot](https://github.com/leeoniya/uPlot) (MIT) behind one `LineChart` component, which styles it to the design language and replaces its legend with a readout of exact amounts. What a chart takes is in [ADR 0014](0014-canonical-chart-series.md). Every point is valued in a single query at the latest price on or before its day, so the series and today's account totals agree, and nothing loads a ledger's history into app code.

## Considered Options

- **d3-scale and d3-shape, rendered as Svelte SVG**: matches the design most closely and stays selectable, but leaves axes, the cursor and resizing for us to write.
- **LayerChart or Chart.js**: complete, but their defaults fight the design language and weigh more.
- **Valuing at today's price**: one lookup, but past points would show units held rather than what they were worth.

## Consequences

- A canvas cannot read `light-dark()` colours, so the chart resolves each token through an element and redraws when the colour scheme changes.
- A chart is an image to assistive technology; its label summarises the range, and the readout gives exact figures as text.
- uPlot draws stacked bars poorly, which a spending-by-category chart will need to work around.
