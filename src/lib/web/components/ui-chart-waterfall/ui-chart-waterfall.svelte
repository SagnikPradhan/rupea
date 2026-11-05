<script lang="ts">
	import Axes from '#lib/web/components/ui-chart-axes/ui-chart-axes.svelte';
	import { SPACE, VIEW } from '#lib/web/shared/chart.ts';
	import type { Step } from '#lib/web/shared/bridge.ts';
	import { formatChange, formatCompact, formatWhole } from '#lib/web/shared/format.ts';
	import { scaleLinear } from 'd3-scale';

	type Props = {
		steps: Step[];
		label: string;
	};

	const { steps, label }: Props = $props();

	/** How wide a bar is of the room it has, and how much room the plot leaves above and below the levels it reaches, as a share of them. */
	const FILL = 0.6;
	const ROOM = 0.15;

	const levels = $derived(steps.flatMap((s) => (s.kind === 'total' ? [s.to] : [s.from, s.to])));
	const low = $derived(Math.min(...levels));
	const high = $derived(Math.max(...levels));
	const y = $derived(
		scaleLinear()
			.domain([low - (high - low || 1) * ROOM, high + (high - low || 1) * ROOM])
			.nice()
			.range([VIEW, 0]),
	);
	const slot = $derived(VIEW / steps.length);
	const bars = $derived(
		steps.map((s, i) => {
			const top = y(Math.max(s.from, s.to));
			const bottom = s.kind === 'total' ? VIEW : y(Math.min(s.from, s.to));

			return {
				...s,
				left: slot * (i + (1 - FILL) / 2),
				width: slot * FILL,
				top,
				height: bottom - top,
				level: y(s.to),
				tone: s.kind === 'total' ? 'total' : s.to >= s.from ? 'up' : 'down',
				figure:
					s.kind === 'total'
						? formatWhole(String(s.to))
						: formatChange('0', String(s.to - s.from)).amount,
			};
		}),
	);
	const across = $derived(bars.map((b) => ({ at: b.left + b.width / 2, label: b.label })));
	const up = $derived(y.ticks(VIEW / SPACE.up).map((n) => ({ at: y(n), label: formatCompact(n) })));
</script>

<figure>
	<div class="plot">
		<div class="area" role="img" aria-label={label}>
			<svg viewBox="0 0 {VIEW} {VIEW}" preserveAspectRatio="none">
				{#each bars.slice(0, -1) as b, i (b.key)}
					{@const next = bars[i + 1]}
					{#if next}
						<line class="link" x1={b.left + b.width} x2={next.left} y1={b.level} y2={b.level} />
					{/if}
				{/each}
				{#each bars as b (b.key)}
					<rect class={b.tone} x={b.left} y={b.top} width={b.width} height={b.height} />
				{/each}
			</svg>
			<Axes {across} {up} />
			{#each bars as b (b.key)}
				<span class="figure {b.tone}" style:left="{b.left + b.width / 2}%" style:top="{b.top}%"
					>{b.figure}</span
				>
			{/each}
		</div>
	</div>
</figure>

<style>
	.plot {
		position: relative;
		height: var(--size-height-1);
	}

	.area {
		position: absolute;
		inset: var(--size-3) var(--size-4) var(--size-3) 0;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	rect.total {
		fill: var(--color-ink-5);
	}

	rect.up {
		fill: var(--color-positive);
	}

	rect.down {
		fill: var(--color-negative);
	}

	.link {
		stroke: var(--color-border);
		vector-effect: non-scaling-stroke;
	}

	.figure {
		position: absolute;
		color: var(--color-ink);
		font: var(--font-size-0) var(--font-mono);
		line-height: 1;
		white-space: nowrap;
		pointer-events: none;
		transform: translate(-50%, calc(-100% - var(--size-0)));
	}

	.figure.up {
		color: var(--color-positive);
	}

	.figure.down {
		color: var(--color-negative);
	}
</style>
