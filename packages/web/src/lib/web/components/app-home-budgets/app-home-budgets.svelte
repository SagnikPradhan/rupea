<script lang="ts">
	import { printAmount, type Amount } from '@rupea/shared/money.ts';
	import HorizontalBars from '#lib/web/components/ui-chart-hbar/ui-chart-hbar.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { watchOf, type BudgetRow } from '#lib/web/shared/budgets.ts';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import { settingsHref } from '#lib/web/shared/links.ts';

	const formats = formatsHere();

	type Props = { rows: BudgetRow[]; today: Temporal.PlainDate; handle: string };

	const { rows, today, handle }: Props = $props();

	const bars = $derived(
		watchOf(rows, today).map(({ row, pace, close }) => ({
			prefix: '',
			name: nameOf(row.budget.account),
			value: row.bar.share,
			detail: `${compact(row.budget.spent)} of ${compact(row.budget.limit)}`,
			href: settingsHref(handle, { budget: row.budget.account }),
			note: leftOf(row.budget),
			pace,
			warn: close,
		})),
	);

	const compact = (a: Amount) => formats.compact(Number(printAmount(a)));

	const leftOf = ({ spent, limit }: { spent: Amount; limit: Amount }) =>
		spent > limit
			? `${compact((spent - limit) as Amount)} over`
			: `${compact((limit - spent) as Amount)} left`;
</script>

{#if rows.length > 0}
	<Panel
		title="Budgets this month"
		subtitle="How far each budget has gone, the ones running out first."
	>
		<HorizontalBars
			{bars}
			limit={1}
			label="Spent of each budget this month"
			format={(n: number) => `${Math.round(n * 100)}%`}
		/>
	</Panel>
{/if}
