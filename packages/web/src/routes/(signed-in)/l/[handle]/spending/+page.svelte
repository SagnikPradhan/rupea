<script lang="ts">
	import {
		listAccounts,
		listBudgets,
		listDailyDeltas,
		listDeltas,
		listInvested,
	} from '#lib/endpoints/accounts.remote.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { openingOf, spansOf } from '@rupea/shared/dates.ts';
	import { ZERO, printAmount, ASSETS, EXPENSES, INCOME } from '@rupea/shared/money.ts';
	import { isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import { PERIOD_PARAMS } from '#lib/web/shared/filter.ts';
	import { coloursOf, distinctOf } from '#lib/web/shared/chart.ts';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import BudgetAside from '#lib/web/components/app-budget-form/app-budget-form.svelte';
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
	import IncomeSources from '#lib/web/components/app-income-sources/app-income-sources.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import {
		formatChange,
		formatIsoDate,
		formatMonthName,
		formatWhole,
	} from '#lib/web/shared/format.ts';
	import { MONTHS, MONTHS_BRIEF, lastMonthOf } from '#lib/web/shared/home.ts';
	import { rowsFor } from '#lib/web/shared/budgets.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { readQuery } from '#lib/web/shared/query.svelte.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const lastMonth = { kind: 'month', at: lastMonthOf(day) } as const;
	const url = readQuery(Spending.SpendingQuery(day));
	const shown = $derived(spansOf(url.query.period, today).current);
	const span = $derived({ from: shown.from.toString(), to: shown.to.toString() });

	const adding = $derived(page.url.searchParams.has('add'));

	const [earned, spent, earnedLast, invested] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period: url.query.period, account: INCOME }),
			listDeltas({ handle, day, period: url.query.period, account: EXPENSES }),
			listDeltas({ handle, day, period: lastMonth, account: INCOME }),
			listInvested({
				handle,
				day,
				period: openingOf(url.query.period, today),
				account: ASSETS,
			}),
		]),
	);
	const [response, daily, budgets, accounts] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period: url.query.period, account: url.query.account }),
			listDailyDeltas({ handle, day, period: url.query.period, account: url.query.account }),
			listBudgets({ handle, from: span.from, day: span.to }),
			adding ? listAccounts(handle) : undefined,
		]),
	);
	const picked = $derived(url.query.span || (url.query.dated ? '' : '12'));
	const month = $derived(
		formatMonthName(earnedLast.data?.[0]?.from.toString() ?? lastMonth.at + '-01'),
	);
	const rows = $derived(rowsFor(budgets.data ?? [], url.query.account));
	const params = $derived([...page.url.searchParams]);
	const editing = $derived(page.url.searchParams.get('budget'));
	const budget = $derived(
		(budgets.data ?? []).find((b) => b.account.toLowerCase() === editing?.toLowerCase()),
	);
	const budgeted = $derived((budgets.data ?? []).map((b) => b.account.toLowerCase()));
	const expenses = $derived(
		(accounts?.data ?? [])
			.map((a) => a.account)
			.filter((a) => a !== EXPENSES && isUnder(a, EXPENSES))
			.filter((a) => !budgeted.includes(a.toLowerCase())),
	);
	const closeHref = $derived(hrefWith(params, { add: '', budget: '' }));
	const spending = $derived(response.data?.[0]);
	const previous = $derived(response.data?.[1]);
	const bucket = $derived(spending?.bucket ?? 'month');

	const parts = $derived(Spending.partsOf(spending, url.query.account));
	const colours = $derived(distinctOf(parts, coloursOf(parts)));

	const first = $derived(spending?.from ?? today);
	const last = $derived(spending?.to ?? today);
	const moved = $derived(
		previous
			? formatChange(
					printAmount(Spending.totalOf(previous, url.query.account) ?? ZERO),
					printAmount(Spending.totalOf(spending, url.query.account) ?? ZERO),
				)
			: null,
	);
	const headline = $derived(
		moved?.percent
			? `${formatWhole(printAmount(Spending.totalOf(spending, url.query.account) ?? ZERO))} spent, ${moved.percent} on the period before`
			: 'What came in, and where it went',
	);
</script>

<PageHeader subtitle={headline}>
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
		...(earnedLast.errors ?? []),
		...(invested.errors ?? []),
		...(response.errors ?? []),
		...(daily.errors ?? []),
		...(budgets.errors ?? []),
	]}
/>

<PanelGrid narrow>
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
		{moved}
	/>
	<SpendingKpis {spending} account={url.query.account} {first} {last} {moved} budgets={rows} />
</PanelGrid>

{#snippet budgetsPanel()}
	<SpendingBudgets {rows} {today} add={hrefWith(params, { add: '1' })} />
{/snippet}

{#if adding || budget}
	<PanelGrid wide>
		{@render budgetsPanel()}
		{#if budget}
			<Aside title="Budget for {nameOf(budget.account)}" onclose={() => goto(closeHref)}>
				{#key budget.account}
					<BudgetAside
						{handle}
						{day}
						shown={span}
						account={budget.account}
						accounts={[]}
						current={budget.current}
					/>
				{/key}
			</Aside>
		{/if}
		{#if !budget}
			<Aside title="Add budget" onclose={() => goto(closeHref)}>
				<BudgetAside {handle} {day} shown={span} account="" accounts={expenses} current={{}} />
			</Aside>
		{/if}
	</PanelGrid>
{/if}

<PanelGrid>
	<div class="column">
		<SpendingBreakdown
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
	</div>
	<div class="column">
		{#if !adding && !budget}{@render budgetsPanel()}{/if}
		<SpendingDays daily={daily.data ?? []} account={url.query.account} />
	</div>
</PanelGrid>

<PanelGrid wide>
	<IncomeCash
		bucket={earned.data?.[0]?.bucket ?? 'month'}
		income={earned.data?.[0]}
		spending={spent.data?.[0]}
		paid={invested.data ?? []}
		first={earned.data?.[0]?.from ?? today}
		last={earned.data?.[0]?.to ?? today}
	/>
	<IncomeSources
		month={earnedLast.data?.[0]}
		range={earned.data?.[0]}
		name={month}
		period={MONTHS[picked] ?? 'Period'}
	/>
</PanelGrid>

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}
</style>
