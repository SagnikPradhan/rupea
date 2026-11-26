<script lang="ts">
	import { EXPENSES, INCOME, ZERO, printAmount, type Amount } from '@rupea/shared/money.ts';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import { formatChange, formatShare, formatWhole } from '#lib/web/shared/format.ts';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		income: Spending.Spent | undefined;
		previous: Spending.Spent | undefined;
		spending: Spending.Spent | undefined;
		month: string;
		before: string;
	};

	const { income, previous, spending, month, before }: Props = $props();

	const earned = $derived(Income.incomeOf(income, INCOME));
	const spent = $derived(Spending.totalOf(spending, EXPENSES) ?? ZERO);
	const saved = $derived((earned - spent) as Amount);
	const investments = $derived(Income.investmentIncomeOf(income));
	const moved = $derived(
		formatChange(printAmount(Income.incomeOf(previous, INCOME)), printAmount(earned)),
	);
</script>

<KpiStrip>
	<Kpi
		label="Income in {month}"
		figure={formatWhole(printAmount(earned))}
		detail={moved.percent ? `${moved.percent} on ${before}` : undefined}
		tone={moved.percent ? (moved.negative ? 'negative' : 'positive') : undefined}
	/>
	<Kpi
		label="Saving rate"
		figure={spending ? (formatShare(printAmount(saved), printAmount(earned)) ?? '–') : '–'}
		detail={spending ? `${formatWhole(printAmount(saved))} saved` : undefined}
	/>
	<Kpi
		label="From investments"
		figure={formatWhole(printAmount(investments))}
		detail="{formatShare(printAmount(investments), printAmount(earned)) ?? '0%'} of income"
	/>
	<Kpi
		label="Spending it covers"
		figure={spending ? (formatShare(printAmount(investments), printAmount(spent)) ?? '–') : '–'}
		detail={spending
			? `${formatWhole(printAmount(investments))} of ${formatWhole(printAmount(spent))}`
			: undefined}
	/>
</KpiStrip>
