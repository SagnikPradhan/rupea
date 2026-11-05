# Charts are SVG drawn from d3

Every chart is a Svelte component that draws SVG, with d3 doing the arithmetic: `d3-scale` for axes, `d3-shape` for lines, areas and the stack that piles spending up and refunds down, `d3-shape` again for the arcs of a donut and `d3-sankey` for the alluvial chart. This replaces uPlot ([ADR 0013](0013-charts-with-uplot.md)) and the canvas the alluvial chart painted itself. With SVG, the colour tokens apply as CSS, a theme change needs no redraw, and hovering a bar or band is an ordinary pointer event. Before, each chart read every colour and font through a probe element, watched the colour scheme, and scaled for dense screens, where uPlot misread fractional font sizes and drew tiny axis labels on phones.

d3 builds only geometry, and Svelte owns the DOM, so no chart calls `d3-selection`. The axes are one small component the bar and line charts share.

A chart never measures itself. It draws in a 100 by 100 `viewBox` stretched over the plot, with strokes that keep their width, and places its axis labels, names and tips in HTML by percent. So the server renders every chart with the page, and the chart is there before the browser runs any script. A pointer is mapped into the same units from the plot's box when it moves.

## Considered Options

- **Keep uPlot**: fast on long series, but stacked bars and the alluvial were already drawn by hand around it, so most of the code was ours anyway.
- **LayerChart**: Svelte charts on d3, but its defaults and components would sit between the design tokens and the marks.
- **Measure the plot, then draw**: exact pixels, but the server cannot know the width, so the chart appeared only after hydration, seconds after the rest of a long page.

## Consequences

- How many labels an axis gets, and how wide a bar may be, are set as a percent of the plot, not in pixels, so a very wide plot gets fewer and wider than it has room for.
- A chart draws one SVG element per bar or point. A year of days is about 365 elements per series, which is fine, but a chart of decades of days should get its points thinned on the server, as [ADR 0030](0030-net-worth-from-year-rows.md) already does.
- `d3-sankey` has had no release since 2019 and brings its own copies of d3-array 2 and d3-shape 1. Without `iterations(0)` and `nodeSort(null)`, it would reorder bars away from the key.
