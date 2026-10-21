<script lang="ts" generics="Row extends Record<string, unknown>">
	import { formatAmount, formatCompact, formatPercent, formatShortDate } from '#lib/web/format.ts';
	import type { Snippet } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	/** A field of the rows to plot, by what it means: the one measure a chart shows, what explains it, or what it is weighed against. */
	type Series = {
		key: keyof Row & string;
		label: string;
		role: 'primary' | 'context' | 'reference';
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
	};

	const { rows, x, series, unit = 'amount', label, summary }: Props = $props();

	const WIDTHS = { primary: 2, context: 1, reference: 1 };
	const DASHES = { primary: [], context: [], reference: [4, 4] };
	const FORMATS = {
		amount: { tick: formatCompact, value: formatAmount },
		percent: { tick: formatPercent, value: (v: string) => formatPercent(Number(v)) },
	};
	const EDGE = 32;

	const hovered = $state({ index: null as number | null });
	const shown = $derived(hovered.index ?? rows.length - 1);

	/** Reads the points before any await, so the chart redraws when they change. */
	const chart = (node: HTMLElement) => {
		const points = data();
		const lines = series.map((s) => ({ ...s }));
		const format = FORMATS[unit];
		const dark = matchMedia('(prefers-color-scheme: dark)');
		const plots: uPlot[] = [];

		const draw = async () => {
			const font = await fontOf(node);
			plots.splice(0).forEach((p) => p.destroy());
			plots.push(new uPlot(options({ node, font, lines, tick: format.tick }), points, node));
		};
		const resize = new ResizeObserver(() =>
			plots.forEach((p) => p.setSize({ width: node.clientWidth, height: node.clientHeight })),
		);
		const touch = (e: PointerEvent) =>
			plots.forEach((p) => {
				const box = p.over.getBoundingClientRect();
				p.setCursor({ left: e.clientX - box.left, top: e.clientY - box.top });
			});

		draw();
		resize.observe(node);
		dark.addEventListener('change', draw);
		node.addEventListener('pointerdown', touch);
		return () => {
			resize.disconnect();
			dark.removeEventListener('change', draw);
			node.removeEventListener('pointerdown', touch);
			plots.forEach((p) => p.destroy());
		};
	};

	const data = (): uPlot.AlignedData => [
		rows.map((r) => Date.parse(String(r[x])) / 1000),
		...series.map((s) => rows.map((r) => Number(r[s.key]))),
	];

	type OptionsInput = {
		node: HTMLElement;
		font: string;
		lines: Series[];
		tick: (n: number) => string;
	};

	const options = (input: OptionsInput): uPlot.Options => {
		const { node, font, lines, tick } = input;
		const ink = colorOf(node, '--color-ink');
		const muted = colorOf(node, '--color-muted');
		const border = colorOf(node, '--color-border');
		const axis = { stroke: muted, font, grid: { show: false }, ticks: { show: false } };

		return {
			width: node.clientWidth,
			height: node.clientHeight,
			padding: [8, 0, 0, 0],
			tzDate: (t) => uPlot.tzDate(new Date(t * 1000), 'Etc/UTC'),
			legend: { show: false },
			cursor: { drag: { x: false, y: false }, points: { show: false }, y: false },
			series: [
				{},
				...lines.map((l) => ({
					label: l.label,
					stroke: l.role === 'primary' ? ink : muted,
					width: WIDTHS[l.role],
					dash: DASHES[l.role],
					points: { show: false },
				})),
			],
			axes: [
				{
					...axis,
					size: 32,
					space: 96,
					values: (u, splits) =>
						splits.map((s) => (edged(u, s) ? '' : formatShortDate(new Date(s * 1000)))),
				},
				{ ...axis, side: 1, size: 48, values: (_, splits) => splits.map(tick) },
			],
			hooks: {
				setCursor: [(u) => (hovered.index = u.cursor.idx ?? null)],
				draw: [(u) => zero(u, border)],
			},
		};
	};

	/** The plot starts flush with the text beside it, so a date there would be cut in half. */
	const edged = (u: uPlot, s: number) => u.valToPos(s, 'x') < EDGE;

	/** The axis fits the data, so zero is drawn only when a line crosses it. */
	const zero = (u: uPlot, color: string) => {
		const scale = u.scales['y'];
		if (!scale || (scale.min ?? 0) >= 0 || (scale.max ?? 0) <= 0) return;

		const y = u.valToPos(0, 'y', true);
		u.ctx.save();
		u.ctx.strokeStyle = color;
		u.ctx.beginPath();
		u.ctx.moveTo(u.bbox.left, y);
		u.ctx.lineTo(u.bbox.left + u.bbox.width, y);
		u.ctx.stroke();
		u.ctx.restore();
	};

	/** A canvas cannot read light-dark colours, so each one is resolved through an element. */
	const colorOf = (node: HTMLElement, token: string) => {
		const probe = node.appendChild(document.createElement('span'));
		probe.style.color = `var(${token})`;
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	};

	const fontOf = async (node: HTMLElement) => {
		const probe = node.appendChild(document.createElement('span'));
		probe.style.font = 'var(--font-size-0) var(--font-mono)';
		const style = getComputedStyle(probe);
		const font = `${style.fontSize} ${style.fontFamily}`;
		probe.remove();
		await document.fonts.load(font);
		return font;
	};
</script>

<figure>
	{@render summary?.(shown)}
	<div class="plot" role="img" aria-label={label} {@attach chart}></div>
	<figcaption>
		{#each series as line (line.key)}
			<span class={line.role}>
				{line.label}
				{#if line.role !== 'primary'}
					<data>{FORMATS[unit].value(String(rows[shown]?.[line.key] ?? ''))}</data>
				{/if}
			</span>
		{/each}
	</figcaption>
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin: 0;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-0) var(--size-3);
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	data {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.primary::before,
	.context::before,
	.reference::before {
		content: '';
		display: inline-block;
		width: 1em;
		margin-right: var(--size-0);
		vertical-align: middle;
		border-top: 1px solid var(--color-muted);
	}

	.primary::before {
		border-top: 2px solid var(--color-ink);
	}

	.reference::before {
		border-top-style: dashed;
	}

	.plot {
		height: 16rem;
		touch-action: pan-y;
	}

	.plot :global(.u-cursor-x) {
		border-right: 1px solid var(--color-muted);
	}
</style>
