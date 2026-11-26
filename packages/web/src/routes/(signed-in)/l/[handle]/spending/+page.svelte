<script lang="ts">
	import {
		listBudgets,
		listDailyDeltas,
		listDeltas,
		listInvested,
	} from '#lib/endpoints/accounts.remote.ts';
	import { openingOf, spansOf } from '@rupea/shared/dates.ts';
	import { ZERO, printAmount, ASSETS, EXPENSES, INCOME } from '@rupea/shared/money.ts';
	import { PERIOD_PARAMS } from '#lib/web/shared/filter.ts';
	import { coloursOf, distinctOf } from '#lib/web/shared/chart.ts';
	import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
	import ChoicePicker from '#lib/web/components/ui-picker-choice/ui-picker-choice.svelte';
	import FilterModal from '#lib/web/components/ui-filter-modal/ui-filter-modal.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import SpendingBudgets from '#lib/web/components/app-spending-budgets/app-spending-budgets.svelte';
	import SpendingBreakdown from '#lib/web/components/app-spending-breakdown/app-spending-breakdown.svelte';
	import SpendingDays from '#lib/web/components/app-spending-days/app-spending-days.svelte';
	import SpendingBars from '#lib/web/components/app-spending-bars/app-spending-bars.svelte';
	import SpendingKpis from '#lib/web/components/app-spending-kpis/app-spending-kpis.svelte';
	import IncomeCash from '#lib/web/components/app-income-cash/app-income-cash.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import { BASE, formatsIn, formatIsoDate } from '#lib/web/shared/format.ts';
	import { getContext } from 'svelte';
	import { MONTHS_BRIEF } from '#lib/web/shared/home.ts';
	import { rowsFor } from '#lib/web/shared/budgets.ts';
	import { readQuery } from '#lib/web/shared/query.svelte.ts';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	const formats = formatsIn(getContext<() => string>(BASE)?.());

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const url = readQuery(Spending.SpendingQuery(day));
	const shown = $derived(spansOf(url.query.period, today).current);
	const span = $derived({ from: shown.from.toString(), to: shown.to.toString() });

	const [earned, spent, invested] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period: url.query.period, account: INCOME }),
			listDeltas({ handle, day, period: url.query.period, account: EXPENSES }),
			listInvested({
				handle,
				day,
				period: openingOf(url.query.period, today),
				account: ASSETS,
			}),
		]),
	);
	const [response, daily, budgets] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period: url.query.period, account: url.query.account }),
			listDailyDeltas({ handle, day, period: url.query.period, account: url.query.account }),
			listBudgets({ handle, from: span.from, day: span.to }),
		]),
	);
	const picked = $derived(url.query.span || (url.query.dated ? '' : '12'));
	const rows = $derived(rowsFor(budgets.data ?? [], url.query.account));
	const spending = $derived(response.data?.[0]);
	const previous = $derived(response.data?.[1]);
	const bucket = $derived(spending?.bucket ?? 'month');

	const income = $derived(Income.earnedOf(earned.data?.[0]));
	const parts = $derived(Spending.partsOf(spending, url.query.account));
	const sources = $derived(Spending.partsOf(income, INCOME));
	const colours = $derived(distinctOf([...parts, ...sources], coloursOf([...parts, ...sources])));

	const first = $derived(spending?.from ?? today);
	const last = $derived(spending?.to ?? today);
	const moved = $derived(
		previous
			? formats.change(
					printAmount(Spending.totalOf(previous, url.query.account) ?? ZERO),
					printAmount(Spending.totalOf(spending, url.query.account) ?? ZERO),
				)
			: null,
	);
</script>

<PageHeader subtitle="Where did your income go?">
	Spending
	{#snippet actions()}
		<FilterModal params={['span', ...PERIOD_PARAMS, 'account']}>
			<FilterSection label="Period">
				<ChoicePicker param="span" label="Period" choices={MONTHS_BRIEF} current={picked} />
			</FilterSection>
			<FilterSection label="Accounts">
				<ChoiceChips
					param="account"
					label="Accounts"
					choices={Spending.choicesOf(spending, url.query.account)}
					current={url.query.account === EXPENSES ? '' : url.query.account}
				/>
			</FilterSection>
		</FilterModal>
	{/snippet}
</PageHeader>

<Issues
	{handle}
	errors={[
		...(earned.errors ?? []),
		...(spent.errors ?? []),
		...(invested.errors ?? []),
		...(response.errors ?? []),
		...(daily.errors ?? []),
		...(budgets.errors ?? []),
	]}
/>

<PanelGrid narrow>
	<IncomeCash
		bucket={earned.data?.[0]?.bucket ?? 'month'}
		income={earned.data?.[0]}
		spending={spent.data?.[0]}
		paid={invested.data ?? []}
		first={earned.data?.[0]?.from ?? today}
		last={earned.data?.[0]?.to ?? today}
	/>
	<SpendingKpis
		{spending}
		income={earned.data?.[0]}
		expenses={spent.data?.[0]}
		account={url.query.account}
		{first}
		{last}
		{moved}
		budgets={rows}
	/>
</PanelGrid>

<PanelGrid>
	<SpendingBudgets {rows} {today} {handle} />
	<SpendingDays daily={daily.data ?? []} />
</PanelGrid>

<PanelGrid full>
	<SpendingBars
		{spending}
		{previous}
		account={url.query.account}
		{parts}
		{colours}
		{bucket}
		compare={url.query.compare}
		scale={url.query.scale}
		{handle}
		{first}
		{last}
	/>
</PanelGrid>

<PanelGrid>
	<SpendingBreakdown
		title="Where the money came from"
		subtitle="Which accounts brought in the most?"
		label="Earned"
		mirrored
		spending={income}
		account={INCOME}
		parts={sources}
		{colours}
		bucket={income?.bucket ?? 'month'}
		first={income?.from ?? today}
		last={income?.to ?? today}
		{handle}
		period={url.query.period}
	/>
	<SpendingBreakdown
		title="Where the money went"
		subtitle="Which accounts took the most?"
		label="Spent"
		{spending}
		account={url.query.account}
		{parts}
		{colours}
		{bucket}
		{first}
		{last}
		{handle}
		period={url.query.period}
	/>
</PanelGrid>
