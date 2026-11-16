<script lang="ts">
	import { listDeltas } from '#lib/endpoints/accounts.remote.ts';
	import { EXPENSES, INCOME } from '@rupea/shared/money.ts';
	import { PERIOD_PARAMS } from '#lib/web/shared/filter.ts';
	import ChoicePicker from '#lib/web/components/ui-picker-choice/ui-picker-choice.svelte';
	import FilterModal from '#lib/web/components/ui-filter-modal/ui-filter-modal.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import IncomeCash from '#lib/web/components/app-income-cash/app-income-cash.svelte';
	import IncomeKpis from '#lib/web/components/app-income-kpis/app-income-kpis.svelte';
	import IncomeSources from '#lib/web/components/app-income-sources/app-income-sources.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import { formatIsoDate, formatMonthName } from '#lib/web/shared/format.ts';
	import { MONTHS, MONTHS_BRIEF, lastMonthOf } from '#lib/web/shared/home.ts';
	import * as Income from '#lib/web/shared/income.ts';
	import { readQuery } from '#lib/web/shared/query.svelte.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const lastMonth = { kind: 'month', at: lastMonthOf(day) } as const;
	const url = readQuery(Income.IncomeQuery(day));

	const [earned, spent, earnedLast, spentLast] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period: url.query.period, account: INCOME }),
			listDeltas({ handle, day, period: url.query.period, account: EXPENSES }),
			listDeltas({ handle, day, period: lastMonth, account: INCOME }),
			listDeltas({ handle, day, period: lastMonth, account: EXPENSES }),
		]),
	);

	const picked = $derived(url.query.span || (url.query.dated ? '' : '12'));
	const month = $derived(
		formatMonthName(earnedLast.data?.[0]?.from.toString() ?? lastMonth.at + '-01'),
	);
	const before = $derived(
		formatMonthName(
			earnedLast.data?.[1]?.from.toString() ?? lastMonthOf(lastMonth.at + '-01') + '-01',
		),
	);
</script>

<PageHeader subtitle="Where money comes in, and how much of it you keep">
	Income
	{#snippet actions()}
		<FilterModal params={['span', ...PERIOD_PARAMS]}>
			<FilterSection label="Period">
				<ChoicePicker param="span" label="Period" choices={MONTHS_BRIEF} current={picked} />
			</FilterSection>
		</FilterModal>
	{/snippet}
</PageHeader>

<Issues
	{handle}
	errors={[
		...(earned.errors ?? []),
		...(spent.errors ?? []),
		...(earnedLast.errors ?? []),
		...(spentLast.errors ?? []),
	]}
/>

<PanelGrid narrow>
	<IncomeCash
		income={earned.data?.[0]}
		spending={spent.data?.[0]}
		first={earned.data?.[0]?.from ?? today}
		last={earned.data?.[0]?.to ?? today}
	/>

	<IncomeKpis
		income={earnedLast.data?.[0]}
		previous={earnedLast.data?.[1]}
		spending={spentLast.data?.[0]}
		{month}
		{before}
	/>
</PanelGrid>

<PanelGrid>
	<IncomeSources
		month={earnedLast.data?.[0]}
		range={earned.data?.[0]}
		name={month}
		period={MONTHS[picked] ?? 'Period'}
	/>
</PanelGrid>
