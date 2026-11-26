<script lang="ts">
	import { EXPENSES, INCOME, ZERO, printAmount, type Amount } from '@rupea/shared/money.ts';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import { overOf, type BudgetRow } from '#lib/web/shared/budgets.ts';
	import { BASE, formatsIn, type Change } from '#lib/web/shared/format.ts';
	import { getContext } from 'svelte';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	const formats = formatsIn(getContext<() => string>(BASE)?.());

	type Props = {
		spending: Spending.Spent | undefined;
		income: Spending.Spent | undefined;
		expenses: Spending.Spent | undefined;
		account: string;
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
		moved: Change | null;
		budgets: BudgetRow[];
	};

	const { spending, income, expenses, account, first, last, moved, budgets }: Props = $props();

	const total = $derived(Spending.totalOf(spending, account) ?? ZERO);
	const earned = $derived(Income.incomeOf(income, INCOME));
	const saved = $derived((earned - (Spending.totalOf(expenses, EXPENSES) ?? ZERO)) as Amount);
	const days = $derived(Spending.daysIn(first, last));
	const over = $derived(overOf(budgets));
	const unpriced = $derived(
		Spending.rowsOf(spending, account).find((r) => r.account === account)?.unpriced ?? 0,
	);
</script>

<KpiStrip label="Spending figures">
	<Kpi
		label="Spent"
		figure={formats.whole(printAmount(total))}
		detail={[
			moved?.percent ? `${moved.percent} on the period before` : '',
			unpriced > 0 ? `excludes ${unpriced} unpriced` : '',
		]
			.filter(Boolean)
			.join(' · ') || undefined}
	/>
	<Kpi
		label="A day"
		figure={formats.whole(printAmount(Spending.dailyAverageOver(total, days)))}
		detail="{days} {days === 1 ? 'day' : 'days'}"
	/>
	<Kpi
		label="Saved"
		figure={formats.whole(printAmount(saved))}
		detail="{formats.share(printAmount(saved), printAmount(earned)) ?? '0%'} of income"
		tone={saved > 0n ? 'positive' : undefined}
	/>
	{#if budgets.length > 0}
		<Kpi
			label="Budgets over"
			figure={over.figure}
			detail={over.detail}
			tone={budgets.some((r) => r.over) ? 'negative' : undefined}
		/>
	{/if}
</KpiStrip>
