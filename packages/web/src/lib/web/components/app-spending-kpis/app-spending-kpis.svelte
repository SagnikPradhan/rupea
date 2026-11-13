<script lang="ts">
	import { ZERO, printAmount } from '@rupea/shared/money.ts';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import { type Change, formatShare, formatWhole } from '#lib/web/shared/format.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		spending: Spending.Spent | undefined;
		account: string;
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
		moved: Change | null;
	};

	const { spending, account, first, last, moved }: Props = $props();

	const total = $derived(Spending.totalOf(spending, account) ?? ZERO);
	const days = $derived(Spending.daysIn(first, last));
	const largest = $derived(
		Spending.largestFirst(Spending.rowsOf(spending, account), account).find(
			(r) => r.parent === account,
		),
	);
</script>

<KpiStrip>
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
		label="Largest"
		figure={largest ? nameOf(largest.account) : '–'}
		detail={largest
			? `${formatWhole(printAmount(largest.amount))} · ${formatShare(printAmount(largest.amount), printAmount(total)) ?? '0%'} of spending`
			: undefined}
	/>
	<Kpi label="Budgets over" soon />
</KpiStrip>
