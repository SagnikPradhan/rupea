<script lang="ts" generics="Row extends Record<string, unknown>">
	import Axes from '#lib/web/components/ui-chart-axes/ui-chart-axes.svelte';
	import Swatch from '#lib/web/components/ui-swatch/ui-swatch.svelte';
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import {
		EDGE,
		partAt,
		pointerIn,
		SPACE,
		stackOf,
		valuesOf,
		VIEW,
	} from '#lib/web/shared/chart.ts';
	import {
		formatAmount,
		formatCompact,
		formatPercent,
		formatBucket,
	} from '#lib/web/shared/format.ts';
	import { scaleUtc } from 'd3-scale';
	import { area, line, type SeriesPoint } from 'd3-shape';
	import type { Snippet } from 'svelte';
	import type { Bucket } from '#lib/shared/dates.ts';

	/** A field of the rows to plot, by what it means: the one measure a chart shows, what explains it, what counts against it, a line with the space shaded between it and the primary, or a part of it piled under the lines in its own shade. */
	type Series = {
		key: keyof Row & string;
		label: string;
		role: 'primary' | 'context' | 'negative' | 'band' | 'part';
		/** A part's colour token. */
		shade?: string;
	};

	type Props = {
		/** One row per point, as an endpoint returns them, with ISO days and exact decimals. */
		rows: Row[];
		/** The field holding each row's ISO day. */
		x: keyof Row & string;
		series: Series[];
		unit?: 'amount' | 'percent';
		label: string;
		/** Drawn above the plot with the row under the cursor, or the last one. */
		summary?: Snippet<[number]>;
		/** Drawn below the plot opposite the key, such as a choice of chart. */
		controls?: Snippet;
	};

	const { rows, x, series, unit = 'amount', label, summary, controls }: Props = $props();

	const FORMATS = {
		amount: { tick: formatCompact, value: formatAmount },
		percent: { tick: formatPercent, value: (v: string) => formatPercent(Number(v)) },
	};

	const BUCKETS: { days: number; bucket: Bucket }[] = [
		{ days: 365, bucket: 'year' },
		{ days: 28, bucket: 'month' },
	];

	const id = $props.id();
	const hovered = $state({ index: null as number | null, part: null as number | null });

	const parts = $derived(series.filter((s) => s.role === 'part'));
	const strokes = $derived(series.filter((s) => s.role !== 'part'));
	const piles = $derived(
		stackOf(
			rows,
			parts.map((p) => p.key),
		),
	);
	const lines = $derived(strokes.map((s) => rows.map((r) => Number(r[s.key]))));
	const values = $derived(valuesOf({ piles, lines, scale: 'linear' }));

	const dates = $derived(
		scaleUtc()
			.domain([new Date(String(rows[0]?.[x])), new Date(String(rows.at(-1)?.[x]))])
			.range([0, VIEW]),
	);
	const xs = $derived(rows.map((r) => dates(new Date(String(r[x])))));
	const path = $derived(
		line<number>()
			.x((_, i) => xs[i] ?? 0)
			.y((v) => values.y(v)),
	);
	const fill = $derived(
		area<number>()
			.x((_, i) => xs[i] ?? 0)
			.y0(VIEW)
			.y1((v) => values.y(v)),
	);
	const between = $derived(
		area<number>()
			.x((_, i) => xs[i] ?? 0)
			.y0((_, i) => values.y(lines[strokes.findIndex((s) => s.role === 'primary')]?.[i] ?? 0))
			.y1((v) => values.y(v)),
	);
	const pile = $derived(
		area<SeriesPoint<Record<string, unknown>>>()
			.x((_, i) => xs[i] ?? 0)
			.y0(([from]) => values.y(from))
			.y1(([, to]) => values.y(to)),
	);

	const across = $derived.by(() => {
		const ticks = dates.ticks(Math.min(VIEW / SPACE.across, rows.length - 1));
		const name = formatBucket[bucketOf(ticks)];
		const gap = dates(ticks[1] ?? 0) - dates(ticks[0] ?? 0);
		const stride = gap > 0 ? Math.ceil(SPACE.across / gap) : 1;

		return ticks
			.map((d) => ({ at: dates(d), label: name(d.toISOString().slice(0, 10)) }))
			.filter((t, i) => i % stride === 0 && t.at >= EDGE);
	});
	const up = $derived(values.ticks.map((n) => ({ at: values.y(n), label: FORMATS[unit].tick(n) })));

	const shown = $derived(hovered.index ?? rows.length - 1);

	/** Finds the point nearest the pointer, and the part whose pile it is over. */
	const point = (e: PointerEvent) => {
		const { left, top } = pointerIn(e);
		const index = xs.reduce(
			(best, at, i) => (Math.abs(at - left) < Math.abs((xs[best] ?? 0) - left) ? i : best),
			0,
		);

		hovered.index = index;
		hovered.part = partAt(piles, index, values.y.invert(top));
	};

	/** Dates a year or a month apart are named by their year or month, nearer ones by their day. */
	const bucketOf = ([first, second]: Date[]): Bucket => {
		const days = ((second?.getTime() ?? 0) - (first?.getTime() ?? 0)) / 86_400_000;
		return BUCKETS.find((b) => days >= b.days)?.bucket ?? 'day';
	};

	const leave = () => Object.assign(hovered, { index: null, part: null });

	/** Where a part's tip stands: over its point, on the top edge of its pile. */
	const tipOf = (k: number, i: number) => {
		const [from, to] = piles[k]?.[i] ?? [0, 0];
		return { left: xs[i] ?? 0, top: values.y(Math.max(from, to)) };
	};
</script>

<figure>
	{@render summary?.(shown)}
	<div class="plot">
		<div
			class="area"
			role="img"
			aria-label={label}
			onpointermove={point}
			onpointerdown={point}
			onpointerleave={leave}
		>
			<svg viewBox="0 0 {VIEW} {VIEW}" preserveAspectRatio="none">
				<defs>
					<linearGradient id="{id}-fade" x2="0" y2="1">
						<stop offset="0" />
						<stop offset="1" />
					</linearGradient>
				</defs>
				{#each piles as points, k (k)}
					<path
						class="part"
						class:faded={hovered.part !== null && hovered.part !== k}
						style:--shade="var({parts[k]?.shade ?? '--color-muted'})"
						d={pile(points)}
					/>
				{/each}
				{#if parts.length === 0 && lines[0]}<path
						class="fill"
						fill="url(#{id}-fade)"
						d={fill(lines[0])}
					/>{/if}
				{#each lines as points, j (j)}
					{#if strokes[j]?.role === 'band'}<path class="between" d={between(points)} />{/if}
					<path class={['line', strokes[j]?.role]} d={path(points)} />
				{/each}
				{#if values.crossed}
					{@const zero = values.y(0)}
					<line class="zero" x1="0" x2={VIEW} y1={zero} y2={zero} />
				{/if}
				{#if hovered.index !== null}
					{@const at = xs[hovered.index]}
					<line class="cursor" x1={at} x2={at} y1="0" y2={VIEW} />
				{/if}
			</svg>
			<Axes {across} {up} />
			{#if hovered.index !== null && hovered.part !== null}
				{@const part = parts[hovered.part]}
				{@const tip = tipOf(hovered.part, hovered.index)}
				<Tooltip left={tip.left} top={tip.top}>
					{part?.label}
					<data>{FORMATS[unit].value(String(rows[hovered.index]?.[part?.key ?? ''] ?? '0'))}</data>
				</Tooltip>
			{/if}
		</div>
	</div>
	<figcaption>
		<div class="key">
			{#each series as line (line.key)}
				{@const k = parts.indexOf(line)}
				<span
					role="presentation"
					class={[line.role, { faded: k >= 0 && hovered.part !== null && hovered.part !== k }]}
					onpointerenter={() => k >= 0 && (hovered.part = k)}
					onpointerleave={() => k >= 0 && (hovered.part = null)}
				>
					{#if line.shade}<Swatch shade={line.shade} />{/if}
					{line.label}
					{#if line.role !== 'primary'}
						<data>{FORMATS[unit].value(String(rows[shown]?.[line.key] ?? ''))}</data>
					{/if}
				</span>
			{/each}
		</div>
		{#if controls}<div class="controls">{@render controls()}</div>{/if}
	</figcaption>
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--size-2);
		color: var(--color-muted);
		font: var(--text-label);
	}

	.key {
		flex: 1 1 auto;
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-0) var(--size-2);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: var(--size-1) var(--size-2);
		margin-left: auto;
	}

	data {
		font-family: var(--font-mono);
	}

	span.primary::before,
	span.context::before,
	span.band::before,
	span.negative::before {
		content: '';
		display: inline-block;
		width: var(--size-2);
		margin-right: var(--size-0);
		vertical-align: middle;
		border-top: var(--size-line-0) solid var(--color-muted);
	}

	span.primary::before {
		border-top: var(--size-line-1) solid var(--color-ink);
	}

	span.negative {
		color: var(--color-negative);
	}

	span.negative::before {
		border-top-color: var(--color-negative);
	}

	span.faded {
		opacity: 0.6;
	}

	.plot {
		position: relative;
		height: var(--size-height-1);
		touch-action: pan-y;
	}

	.area {
		position: absolute;
		inset: var(--size-1) var(--size-4) var(--size-3) 0;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	path,
	line {
		vector-effect: non-scaling-stroke;
	}

	stop {
		stop-color: var(--color-ink-2);
	}

	stop + stop {
		stop-opacity: 0;
	}

	.part {
		fill: var(--shade);
	}

	path.faded {
		opacity: 0.2;
	}

	.between {
		fill: var(--color-positive);
		fill-opacity: 0.2;
	}

	.line {
		fill: none;
		stroke: var(--color-muted);
		stroke-width: var(--size-line-0);
	}

	.line.primary {
		stroke: var(--color-ink);
		stroke-width: var(--size-line-1);
	}

	.line.negative {
		stroke: var(--color-negative);
	}

	.zero {
		stroke: var(--color-border);
	}

	.cursor {
		stroke: var(--color-muted);
	}
</style>
