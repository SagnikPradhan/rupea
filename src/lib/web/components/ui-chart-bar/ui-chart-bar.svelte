<script lang="ts" generics="Row extends Record<string, unknown>">
	import Axes from '#lib/web/components/ui-chart-axes/ui-chart-axes.svelte';
	import Key from '#lib/web/components/ui-chart-key/ui-chart-key.svelte';
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import type { Bucket } from '#lib/shared/dates.ts';
	import {
		EDGE,
		edgeOf,
		labelsIn,
		partAt,
		pointerIn,
		seriesOf,
		stackOf,
		valuesOf,
		VIEW,
	} from '#lib/web/shared/chart.ts';
	import type { Scale } from '#lib/web/shared/choices.ts';
	import { formatAmount, formatBucket, formatCompact } from '#lib/web/shared/format.ts';
	import { curveMonotoneX, line } from 'd3-shape';
	import type { Snippet } from 'svelte';

	/**
	 * A field of the rows to plot: a part piled into every bar, in order from
	 * zero, or a dashed curve they are weighed against.
	 */
	type Series = {
		key: keyof Row & string;
		label: string;
		role: 'part' | 'reference';
		/** Which chart colour a part takes; the next free one without. */
		colour?: number;
	};

	type Props = {
		/** One row per bar, as an endpoint returns them, with exact decimals. */
		rows: Row[];
		/** The field holding the ISO day each bar starts on. */
		x: keyof Row & string;
		/** How many days one bar adds up, which names it on the axis. */
		bucket: Bucket;
		series: Series[];
		/**
		 * What the key reads while no bar is under the cursor, such as the parts'
		 * totals.
		 */
		whole: Row;
		label: string;
		scale?: Scale;
		/** Drawn above the plot with the row under the cursor, or none. */
		summary?: Snippet<[number | null]>;
		/** Drawn at the end of the key, such as a choice of scale. */
		controls?: Snippet;
	};

	const {
		rows,
		x,
		bucket,
		series,
		whole,
		label,
		scale = 'linear',
		summary,
		controls,
	}: Props = $props();

	/**
	 * A bar fills this share of its step, and no more than this percent of the
	 * plot.
	 */
	const WIDTH = { share: 0.6, most: 4 };
	/**
	 * How many bars apart the axis may name them, so the names land on whole
	 * quarters and years.
	 */
	const STRIDES = [1, 2, 3, 6, 12, 24, 48];

	const hovered = $state({ index: null as number | null, part: null as number | null });

	const parts = $derived(series.filter((s) => s.role === 'part'));
	const references = $derived(series.filter((s) => s.role === 'reference'));
	const piles = $derived(
		stackOf(
			rows,
			parts.map((p) => p.key),
		),
	);
	const lines = $derived(
		references.map((s) => rows.map((r) => (r[s.key] == null ? null : Number(r[s.key])))),
	);
	const measured = $state({ rect: undefined as DOMRectReadOnly | undefined });
	const box = $derived({ width: measured.rect?.width ?? 0, height: measured.rect?.height ?? 0 });
	const values = $derived(valuesOf({ piles, lines, scale, height: box.height }));

	const step = $derived(VIEW / Math.max(rows.length, 1));
	const width = $derived(Math.min(step * WIDTH.share, WIDTH.most));
	const curve = $derived(
		line<number | null>()
			.defined((v) => v !== null)
			.x((_, i) => centreOf(i))
			.y((v) => values.y(v ?? 0))
			.curve(curveMonotoneX),
	);

	const across = $derived.by(() => {
		const room = VIEW / labelsIn(box.width, 'across');
		const stride = STRIDES.find((s) => s * step >= room) ?? STRIDES.length;
		const name = formatBucket[bucket];

		return rows
			.map((r, i) => ({ at: centreOf(i), label: name(String(r[x])) }))
			.filter((t, i) => i % stride === 0 && t.at >= EDGE);
	});
	const up = $derived(values.ticks.map((n) => ({ at: values.y(n), label: formatCompact(n) })));

	const shown = $derived((hovered.index === null ? undefined : rows[hovered.index]) ?? whole);

	const entries = $derived([
		...parts.map((p, k) => ({
			label: p.label,
			amount: formatCompact(Number(shown[p.key] ?? 0)),
			shade: seriesOf(p.colour ?? k),
			part: k,
		})),
		...references.map((r) => ({
			label: r.label,
			amount: shown[r.key] == null ? undefined : formatCompact(Number(shown[r.key])),
			mark: 'reference' as const,
		})),
	]);

	/**
	 * Finds the bar under the pointer, and the part of it, or none beside the bar
	 * or above it.
	 */
	const point = (e: PointerEvent) => {
		const { left, top } = pointerIn(e);
		const index = Math.min(Math.max(Math.floor(left / step), 0), rows.length - 1);
		const beside = Math.abs(left - centreOf(index)) > width / 2;

		hovered.index = index;
		hovered.part = beside ? null : partAt(piles, index, values.y.invert(top));
	};

	const leave = () => Object.assign(hovered, { index: null, part: null });

	/**
	 * Where a part stands in its bar, on top of the parts before it that run the
	 * same way.
	 */
	const barOf = (k: number, i: number) => {
		const [from, to] = piles[k]?.[i] ?? [0, 0];
		const top = values.y(Math.max(from, to));

		return { left: centreOf(i) - width / 2, top, height: values.y(Math.min(from, to)) - top };
	};

	const centreOf = (i: number) => step * (i + 0.5);
</script>

<figure>
	{@render summary?.(hovered.index)}
	<div class="plot">
		<div
			class="area"
			role="img"
			aria-label={label}
			onpointermove={point}
			onpointerdown={point}
			onpointerleave={leave}
			bind:contentRect={measured.rect}
		>
			<svg viewBox="0 0 {VIEW} {VIEW}" preserveAspectRatio="none">
				{#if hovered.index !== null}
					{@const at = centreOf(hovered.index)}
					<line class="cursor" x1={at} x2={at} y1="0" y2={VIEW} />
				{/if}
				{#each parts as part, k (part.key)}
					<g
						class:faded={hovered.part !== null && hovered.part !== k}
						style:--shade="var({seriesOf(parts[k]?.colour ?? k)})"
						style:--edge="var({edgeOf(seriesOf(parts[k]?.colour ?? k))})"
					>
						{#each rows, i}
							{@const bar = barOf(k, i)}
							<rect x={bar.left} y={bar.top} {width} height={bar.height} />
						{/each}
					</g>
				{/each}
				{#each lines as points, j (j)}
					<path class="reference" d={curve(points)} />
				{/each}
				{#if values.crossed}
					{@const zero = values.y(0)}
					<line class="zero" x1="0" x2={VIEW} y1={zero} y2={zero} />
				{/if}
			</svg>
			<Axes {across} {up} />
			{#if hovered.index !== null && hovered.part !== null}
				{@const part = parts[hovered.part]}
				{@const bar = barOf(hovered.part, hovered.index)}
				<Tooltip left={bar.left + width / 2} top={bar.top}>
					{part?.label}
					<data>{formatAmount(String(rows[hovered.index]?.[part?.key ?? ''] ?? '0'))}</data>
				</Tooltip>
			{/if}
		</div>
	</div>
	<figcaption>
		<Key {entries} focus={hovered.part} onfocus={(part: number | null) => (hovered.part = part)} />
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
		display: grid;
		align-items: end;
		gap: var(--size-2);
		color: var(--color-muted);
		font: var(--text-label);
	}

	data::before {
		content: '– ';
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: var(--size-1);
	}

	@media (width >= 48rem) {
		figcaption {
			grid-template-columns: 2fr 1fr;
		}
	}

	data {
		font-family: var(--font-mono);
	}

	.plot {
		position: relative;
		height: var(--size-height-0);
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

	rect,
	path,
	line {
		vector-effect: non-scaling-stroke;
	}

	rect {
		fill: var(--shade);
		stroke: var(--edge);
		stroke-width: var(--size-line-0);
	}

	g.faded {
		opacity: 0.2;
	}

	path.reference {
		fill: none;
		stroke: var(--color-muted);
		stroke-dasharray: var(--size-0);
	}

	.zero {
		stroke: var(--color-border);
	}

	.cursor {
		stroke: var(--color-muted);
	}
</style>
