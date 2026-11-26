<script lang="ts">
	import { EXPENSES, INCOME, ZERO, printAmount, type Amount } from '@rupea/shared/money.ts';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import { overOf, type BudgetRow } from '#lib/web/shared/budgets.ts';
	import { type Change, formatShare, formatWhole } from '#lib/web/shared/format.ts';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

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
</script>

<KpiStrip label="Spending figures">
	<Kpi
		label="Spent"
		figure={formatWhole(printAmount(total))}
		detail={moved?.percent ? `${moved.percent} on the period before` : undefined}
	/>
	<Kpi
		label="A day"
		figure={formatWhole(printAmount(Spending.dailyAverageOver(total, days)))}
		detail="{days} {days === 1 ? 'day' : 'days'}"
	/>
	<Kpi
		label="Saved"
		figure={formatWhole(printAmount(saved))}
		detail="{formatShare(printAmount(saved), printAmount(earned)) ?? '0%'} of income"
		tone={saved > 0n ? 'positive' : undefined}
	/>
	<Kpi
		label="Budgets over"
		figure={over.figure}
		detail={over.detail}
		tone={budgets.some((r) => r.over) ? 'negative' : undefined}
	/>
</KpiStrip>
