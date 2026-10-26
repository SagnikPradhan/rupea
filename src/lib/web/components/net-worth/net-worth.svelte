<script lang="ts">
	import LineChart from '#lib/web/components/line-chart/line-chart.svelte';
	import TreemapChart from '#lib/web/components/treemap-chart/treemap-chart.svelte';
	import { ASSETS } from '#lib/shared/filter.ts';
	import type { Chart } from '#lib/web/shared/choices.ts';
	import { formatAmount, formatChange, formatDate, formatExact } from '#lib/web/shared/format.ts';
	import { areasOf, withAreas } from '#lib/web/shared/worth.ts';
	import type { Snippet } from 'svelte';

	type Worth = {
		day: string;
		assets: string;
		liabilities: string;
		worth: string;
		parts: Record<string, string>;
		unpriced: number;
	};

	type Props = {
		/** Net worth at the end of each day shown, as the endpoint returns it. */
		worth: Worth[];
		/** Balance accounts at the end of the last day, for the boxes of each one. */
		accounts: {
			account: string;
			total: string;
			holdings: { commodity: string; value: string | null }[];
		}[];
		/** The account narrowed to, or none for every balance account; the treemap boxes assets then, as owing has no size. */
		account: string | null;
		chart: Chart;
		/** Drawn below the chart, such as a choice of chart. */
		controls?: Snippet;
	};

	const { worth, accounts, account, chart, controls }: Props = $props();

	const first = $derived(worth[0]);
	const last = $derived(worth.at(-1));
	const areas = $derived(areasOf(worth));
	const rows = $derived(withAreas(worth, areas));
	const owing = $derived(worth.some((w) => Number(w.liabilities) !== 0));
</script>

{#if first && last}
	<section aria-labelledby="worth">
		{#if chart === 'flow'}
			<TreemapChart
				rows={accounts}
				account={account ?? ASSETS}
				label="What {account ?? ASSETS} held on {formatDate(last.day)}, by account"
				{controls}
			>
				{#snippet summary()}{@render worthOn(worth.length - 1)}{/snippet}
			</TreemapChart>
		{:else}
			<LineChart
				{rows}
				x="day"
				series={[
					{ key: 'worth', label: 'Net worth', role: 'primary' },
					...areas.map((a) => ({
						key: a.key,
						label: a.label,
						role: 'part' as const,
						shade: a.shade,
					})),
					...(owing ? [{ key: 'liabilities', label: 'Owed', role: 'negative' as const }] : []),
				]}
				label="Net worth from {formatDate(first.day)} to {formatDate(last.day)}, {formatAmount(
					first.worth,
				)} to {formatAmount(last.worth)}"
				summary={worthOn}
				{controls}
			/>
		{/if}
	</section>
{/if}

{#snippet worthOn(index: number)}
	{@const shown = worth[index] ?? last}
	{#if first && shown}
		{@const change = formatChange(first.worth, shown.worth)}
		<div class="summary">
			<h2 id="worth" class="label">Net worth</h2>
			<p class="figure" title={formatExact(shown.worth)}>{formatAmount(shown.worth)}</p>
			<p>
				<span class={change.negative ? 'negative' : 'positive'}>
					{change.amount}{#if change.percent !== null}&nbsp;({change.percent}){/if}
				</span>
				{formatDate(first.day)} – {formatDate(shown.day)}
				{#if shown.unpriced > 0}
					<span class="nowrap">· excludes {shown.unpriced} unpriced</span>
				{/if}
			</p>
		</div>
	{/if}
{/snippet}

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin-bottom: var(--size-2);
	}

	h2 {
		margin: 0;
	}

	p {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	p.figure {
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: min(var(--font-size-display), 12vw);
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.nowrap {
		white-space: nowrap;
	}
</style>
