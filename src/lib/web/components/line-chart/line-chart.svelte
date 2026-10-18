<script lang="ts">
	import { formatAmount } from '#lib/web/format.ts';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	type Line = {
		label: string;
		/** Exact amounts like `1250.50`, one per day. */
		values: string[];
		/** The line a page exists to show is ink, and the page shows its value as its figure; the rest are faint, dashed to tell them apart. */
		kind: 'ink' | 'faint' | 'dashed';
	};

	type Props = {
		/** ISO dates, one per point. */
		days: string[];
		lines: Line[];
		label: string;
		/** The point under the cursor, or null when there is none. */
		onhover: (index: number | null) => void;
	};

	const { days, lines, label, onhover }: Props = $props();

	const WIDTHS = { ink: 2, faint: 1, dashed: 1 };
	const DASHES = { ink: [], faint: [], dashed: [4, 4] };
	const EDGE = 32;

	const ticks = new Intl.NumberFormat('en-IN', { notation: 'compact' });
	const dates = new Intl.DateTimeFormat('en-IN', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	});

	const hovered = $state({ index: null as number | null });
	const shown = $derived(hovered.index ?? days.length - 1);

	// Reading the points before any await redraws the chart when they change.
	const chart = (node: HTMLElement) => {
		const points = data();
		const series = seriesOf();
		const dark = matchMedia('(prefers-color-scheme: dark)');
		const plots: uPlot[] = [];

		const draw = async () => {
			const font = await fontOf(node);
			plots.splice(0).forEach((p) => p.destroy());
			plots.push(new uPlot(options(node, font, series), points, node));
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
		days.map((d) => Date.parse(d) / 1000),
		...lines.map((l) => l.values.map(Number)),
	];

	const seriesOf = () => lines.map((l) => ({ label: l.label, kind: l.kind }));

	const options = (
		node: HTMLElement,
		font: string,
		series: Pick<Line, 'label' | 'kind'>[],
	): uPlot.Options => {
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
				...series.map((l) => ({
					label: l.label,
					stroke: l.kind === 'ink' ? ink : muted,
					width: WIDTHS[l.kind],
					dash: DASHES[l.kind],
					points: { show: false },
				})),
			],
			axes: [
				{
					...axis,
					size: 32,
					space: 96,
					values: (u, splits) => splits.map((s) => (edged(u, s) ? '' : dates.format(s * 1000))),
				},
				{
					...axis,
					side: 1,
					size: 48,
					values: (_, splits) => splits.map((s) => ticks.format(s)),
				},
			],
			hooks: {
				setCursor: [
					(u) => {
						hovered.index = u.cursor.idx ?? null;
						onhover(hovered.index);
					},
				],
				draw: [(u) => zero(u, border)],
			},
		};
	};

	// The plot starts flush with the text beside it, so a date there would be cut in half.
	const edged = (u: uPlot, s: number) => u.valToPos(s, 'x') < EDGE;

	// The axis fits the data, so zero is drawn only when a line crosses it.
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

	// A canvas cannot read `light-dark()`, so each colour is resolved through an element.
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
	<div class="plot" role="img" aria-label={label} {@attach chart}></div>
	<figcaption>
		{#each lines as line (line.label)}
			<span class={line.kind}>
				{line.label}
				{#if line.kind !== 'ink'}<data>{formatAmount(line.values[shown] ?? '')}</data>{/if}
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

	.ink::before,
	.faint::before,
	.dashed::before {
		content: '';
		display: inline-block;
		width: 1em;
		margin-right: var(--size-0);
		vertical-align: middle;
		border-top: 1px solid var(--color-muted);
	}

	.ink::before {
		border-top: 2px solid var(--color-ink);
	}

	.dashed::before {
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
