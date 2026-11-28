<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Axes from '#lib/web/components/ui-chart-axes/ui-chart-axes.svelte';
	import { scaleLinear } from 'd3-scale';

	type Bar = {
		prefix: string;
		name: string;
		value: number | null;
		/** A line under the name. */
		detail?: string;
		href?: ResolvedPathname;
		/** Written at the right in place of the value beside the bar. */
		note?: string;
		/** Where today falls on the way to the limit, dashed across the bar. */
		pace?: number;
		/** Ahead of pace, so amber. */
		warn?: boolean;
	};

	type Props = {
		bars: Bar[];
		label: string;
		/**
		 * A value the bars may not pass: a line is drawn there and what is past it
		 * is over.
		 */
		limit?: number;
		/** Writes a value on the axis and beside its bar. */
		format: (value: number) => string;
	};

	const { bars, label, limit, format }: Props = $props();

	const TICKS = 4;

	const values = $derived(bars.map((b) => b.value ?? 0));
	const x = $derived(
		scaleLinear()
			.domain([Math.min(0, ...values), Math.max(0, limit ?? 0, ...values, Number.EPSILON)])
			.nice(TICKS),
	);
	const across = $derived(x.ticks(TICKS).map((n) => ({ at: x(n) * 100, label: format(n) })));
	const zero = $derived(x(0) * 100);

	const barOf = (value: number) => {
		const end = x(Math.min(value, limit ?? value)) * 100;

		return { left: Math.min(zero, end), width: Math.abs(end - zero) };
	};

	const overOf = (value: number) => {
		const start = x(limit ?? value) * 100;

		return { left: start, width: Math.max(x(value) * 100 - start, 0) };
	};
</script>

<div class="chart" style:--rows={bars.length} role="img" aria-label={label}>
	<div class="plot">
		{#each across as tick (tick.at)}
			<span class="grid" style:left="{tick.at}%"></span>
		{/each}
		<span class="zero" style:left="{zero}%"></span>
		{#if limit !== undefined}<span class="zero" style:left="{x(limit) * 100}%"></span>{/if}
		<Axes {across} up={[]} />
	</div>

	<ul role="list">
		{#each bars as bar (bar.prefix + bar.name)}
			{@const value = bar.value}
			<li>
				{#if bar.href}
					<a class="name" href={bar.href}><span class="prefix">{bar.prefix}</span>{bar.name}</a>
				{:else}
					<span class="name"><span class="prefix">{bar.prefix}</span>{bar.name}</span>
				{/if}
				<span class="track">
					<span class="rail"></span>
					{#if value !== null}
						{@const shape = barOf(value)}
						{@const past = overOf(value)}
						<span
							class={['bar', { negative: value < 0, warn: bar.warn }]}
							style:left="{shape.left}%"
							style:width="{shape.width}%"
						></span>
						{#if past.width > 0}
							<span class="bar negative" style:left="{past.left}%" style:width="{past.width}%"
							></span>
						{/if}
						{#if bar.pace !== undefined}<span class="today" style:left="{x(bar.pace) * 100}%"
							></span>{/if}
						{#if !bar.note}
							<span class={['value', { negative: value < 0 }]} style:left="{x(value) * 100}%">
								{format(value)}
							</span>
						{/if}
					{/if}
					{#if value === null}
						<span class="value" style:left="{zero}%">–</span>
					{/if}
				</span>
				{#if bar.note}
					<span class={['note', { negative: value !== null && value > (limit ?? Infinity) }]}>
						{bar.note}
					</span>
				{/if}
				{#if bar.detail}<span class="detail">{bar.detail}</span>{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.chart {
		display: grid;
		grid-template-columns: max-content 1fr minmax(var(--size-4), max-content) max-content;
		grid-template-rows: repeat(var(--rows), var(--size-4)) var(--size-3);
		column-gap: var(--size-3);
	}

	.plot {
		position: relative;
		grid-column: 2;
		grid-row: 1 / span var(--rows);
	}

	.grid,
	.zero {
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--size-line-0);
		background: var(--color-subtle);
	}

	.zero {
		background: var(--color-border);
	}

	ul {
		display: grid;
		padding: 0;
		grid-column: 1 / -1;
		grid-row: 1 / span var(--rows);
		grid-template-columns: subgrid;
		grid-template-rows: subgrid;
	}

	li {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
	}

	.detail {
		grid-column: 4;
		grid-row: 1;
		color: var(--color-muted);
		font: var(--text-label);
		font-family: var(--font-mono);
		white-space: nowrap;
	}

	.name {
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	.prefix {
		color: var(--color-muted);
	}

	.track {
		position: relative;
		height: var(--size-3);
	}

	.rail {
		position: absolute;
		inset: 0;
		background: var(--color-subtle);
		opacity: 0.5;
	}

	.bar {
		position: absolute;
		top: 0;
		height: 100%;
		background: var(--color-chart-1);
	}

	.bar.warn {
		background: var(--color-chart-2);
	}

	.bar.negative {
		background: var(--color-negative);
	}

	.today {
		position: absolute;
		top: calc(var(--size-0) * -1);
		bottom: calc(var(--size-0) * -1);
		border-left: var(--size-line-0) dashed var(--color-muted);
	}

	.note {
		grid-column: 3;
		grid-row: 1;
		color: var(--color-muted);
		font: var(--text-label);
		font-family: var(--font-mono);
		white-space: nowrap;
	}

	.note.negative {
		color: var(--color-negative);
	}

	a.name {
		color: inherit;
		text-decoration: none;
	}

	a.name:hover {
		text-decoration: underline;
	}

	.value {
		position: absolute;
		top: 50%;
		padding-inline: var(--size-1);
		color: var(--color-muted);
		font: var(--text-label);
		font-family: var(--font-mono);
		white-space: nowrap;
		transform: translateY(-50%);
	}

	.value.negative {
		color: var(--color-negative);
		transform: translate(-100%, -50%);
	}
</style>
