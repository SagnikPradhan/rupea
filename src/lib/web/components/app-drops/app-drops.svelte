<script lang="ts">
	import BarRow from '#lib/web/components/ui-bar-row/ui-bar-row.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import LineChart from '#lib/web/components/ui-chart-line/ui-chart-line.svelte';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { formatBucket, formatDate, formatPercent } from '#lib/web/shared/format.ts';

	type Drops = {
		underwater: { day: string; depth: number }[];
		lows: { account: string; depth: number; day: string }[];
	};

	const { drops }: { drops: Drops } = $props();

	const first = $derived(drops.underwater[0]);
	const last = $derived(drops.underwater.at(-1));
	const lowest = $derived(drops.underwater.toSorted((a, b) => a.depth - b.depth)[0]);
	const fell = $derived(drops.lows.filter((l) => l.depth < 0));
	const worst = $derived(fell[0]?.depth ?? -1);
</script>

{#if first && last && lowest}
	<section aria-labelledby="drops">
		<LineChart
			rows={drops.underwater}
			x="day"
			unit="percent"
			series={[{ key: 'depth', label: 'Below its high', role: 'primary' }]}
			label="How far investments stood below their high from {formatDate(first.day)} to {formatDate(
				last.day,
			)}, lowest {formatPercent(lowest.depth)} on {formatDate(lowest.day)}"
			summary={depthOn}
		/>

		<ul role="list">
			{#each fell as low (low.account)}
				<BarRow
					name={nameOf(low.account)}
					detail="low {formatBucket.month(low.day)}"
					figure={formatPercent(low.depth)}
					tone="negative"
					share={low.depth / worst}
				/>
			{/each}
		</ul>
	</section>
{/if}

{#snippet depthOn(index: number)}
	{@const shown = drops.underwater[index] ?? last}
	{#if shown && lowest}
		<ChartSummary id="drops" label="Below its high" figure={formatPercent(shown.depth)}>
			<span class="negative">
				Lowest {formatPercent(lowest.depth)}, {formatBucket.month(lowest.day)}
			</span>
			{formatDate(shown.day)}
		</ChartSummary>
	{/if}
{/snippet}

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		margin: 0;
		padding: 0;
	}

	.negative {
		color: var(--color-negative);
	}
</style>
