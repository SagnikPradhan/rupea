<script lang="ts">
	import AccountChips from '#lib/web/components/app-account-chips/app-account-chips.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import LineChart from '#lib/web/components/ui-chart-line/ui-chart-line.svelte';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { BASE, formatsIn } from '#lib/web/shared/format.ts';
	import { getContext } from 'svelte';

	const formats = formatsIn(getContext<() => string>(BASE)?.());

	type Drops = {
		underwater: { day: string; depth: number }[];
		lows: { account: string; depth: number; day: string }[];
	};

	type Props = { drops: Drops; account?: string | null };

	const { drops, account = null }: Props = $props();

	const first = $derived(drops.underwater[0]);
	const last = $derived(drops.underwater.at(-1));
	const lowest = $derived(drops.underwater.toSorted((a, b) => a.depth - b.depth)[0]);
	const fell = $derived(
		drops.lows
			.filter((l) => l.depth < 0)
			.map((l) => ({
				account: l.account,
				name: nameOf(l.account),
				figure: `low ${formats.bucket.month(l.day)} ${formats.percent(l.depth)}`,
			})),
	);
</script>

{#if first && last && lowest}
	<section aria-labelledby="drops">
		<LineChart
			rows={drops.underwater}
			x="day"
			unit="percent"
			falling
			series={[{ key: 'depth', label: 'Below its high', role: 'primary' }]}
			label="How far investments stood below their high from {formats.date(
				first.day,
			)} to {formats.date(last.day)}, lowest {formats.percent(lowest.depth)} on {formats.date(
				lowest.day,
			)}"
			summary={depthOn}
		/>

		<AccountChips chips={fell} {account} tone="negative" />
	</section>
{/if}

{#snippet depthOn(index: number)}
	{@const shown = drops.underwater[index] ?? last}
	{#if shown && lowest}
		<ChartSummary id="drops" label="Below its high" figure={formats.percent(shown.depth)}>
			<span class="negative">
				Lowest {formats.percent(lowest.depth)}, {formats.bucket.month(lowest.day)}
			</span>
			{formats.date(shown.day)}
		</ChartSummary>
	{/if}
{/snippet}

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
