<script lang="ts">
	import { printAmount, type Amount } from '@rupea/shared/money.ts';
	import HorizontalBars from '#lib/web/components/ui-chart-hbar/ui-chart-hbar.svelte';
	import Totals from '#lib/web/components/ui-chart-totals/ui-chart-totals.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { totalOf, watchOf, type BudgetRow } from '#lib/web/shared/budgets.ts';
	import { formatCompact, formatWhole } from '#lib/web/shared/format.ts';
	import { settingsHref } from '#lib/web/shared/links.ts';

	type Props = { rows: BudgetRow[]; today: Temporal.PlainDate; handle: string };

	const { rows, today, handle }: Props = $props();

	const total = $derived(totalOf(rows));

	const used = $derived(
		total.limit > 0n ? Math.round(Number((total.spent * 1000n) / total.limit) / 10) : 0,
	);

	const bars = $derived(
		watchOf(rows, today).map(({ row, pace, close }) => ({
			prefix: '',
			name: nameOf(row.budget.account),
			value: row.bar.share,
			detail: `${compact(row.budget.spent)} of ${compact(row.budget.limit)}`,
			href: settingsHref(handle, { budget: row.budget.account }),
			note: leftOf(row.budget, compact),
			pace,
			warn: close,
		})),
	);

	const compact = (a: Amount) => formatCompact(Number(printAmount(a)));

	const whole = (a: Amount) => formatWhole(printAmount(a));

	const leftOf = (
		{ spent, limit }: { spent: Amount; limit: Amount },
		show: (a: Amount) => string,
	) =>
		spent > limit
			? `${show((spent - limit) as Amount)} over`
			: `${show((limit - spent) as Amount)} left`;
</script>

<Panel title="Budgets" subtitle="Which budgets are running out?">
	{#snippet actions()}
		<Button href={settingsHref(handle, { add: 'budget' })}>Add budget</Button>
	{/snippet}
	{#if rows.length > 0}
		<Totals
			totals={[
				{
					label: 'Spent',
					figure: whole(total.spent),
					detail: `of ${whole(total.limit)} allowed`,
				},
				{
					label: total.spent > total.limit ? 'Over' : 'Left',
					figure: whole(total.gap),
					detail: `${used}% of limits used`,
				},
			]}
		/>

		<HorizontalBars
			{bars}
			limit={1}
			label="Spent of each budget"
			format={(n: number) => `${Math.round(n * 100)}%`}
		/>
	{:else}
		<p class="empty">No budgets yet. Add one to see what is left.</p>
	{/if}
</Panel>

<style>
	.empty {
		color: var(--color-muted);
	}
</style>
