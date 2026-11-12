<script lang="ts">
	import { listDailyDeltas, listDeltas } from '#lib/endpoints/accounts.remote.ts';
	import { ZERO, printAmount } from '#lib/shared/amounts.ts';
	import { PERIOD_PARAMS } from '#lib/shared/dates.ts';
	import { EXPENSES, INCOME } from '#lib/shared/accounts.ts';
	import { coloursOf, distinctOf } from '#lib/web/shared/chart.ts';
	import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
	import ChoicePicker from '#lib/web/components/ui-picker-choice/ui-picker-choice.svelte';
	import FilterModal from '#lib/web/components/ui-filter-modal/ui-filter-modal.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import SpendingFlows from '#lib/web/components/app-spending-flows/app-spending-flows.svelte';
	import SpendingAccounts from '#lib/web/components/app-spending-accounts/app-spending-accounts.svelte';
	import SpendingDays from '#lib/web/components/app-spending-days/app-spending-days.svelte';
	import SpendingBars from '#lib/web/components/app-spending-bars/app-spending-bars.svelte';
	import SpendingKpis from '#lib/web/components/app-spending-kpis/app-spending-kpis.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import { formatChange, formatIsoDate } from '#lib/web/shared/format.ts';
	import { MONTHS_BRIEF } from '#lib/web/shared/home.ts';
	import { readQuery } from '#lib/web/shared/query.svelte.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const url = readQuery(Spending.SpendingQuery(day));

	const [response, earned, daily] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period: url.query.period, account: url.query.account }),
			url.query.account === EXPENSES
				? listDeltas({ handle, day, period: url.query.period, account: INCOME })
				: undefined,
			listDailyDeltas({ handle, day, period: url.query.period, account: url.query.account }),
		]),
	);
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
</script>

<PageHeader subtitle="Where the money went, month by month">
	Expenses
	{#snippet actions()}
		<FilterModal params={['span', ...PERIOD_PARAMS, 'account']}>
			<FilterSection label="Period">
				<ChoicePicker
					param="span"
					label="Period"
					choices={MONTHS_BRIEF}
					current={url.query.span || (url.query.dated ? '' : '12')}
				/>
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
	errors={[...(response.errors ?? []), ...(earned?.errors ?? []), ...(daily.errors ?? [])]}
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
	<SpendingKpis {spending} account={url.query.account} {first} {last} {moved} />
</PanelGrid>

<PanelGrid>
	<SpendingFlows
		{spending}
		income={earned?.data?.[0]}
		account={url.query.account}
		{parts}
		{colours}
	/>
	<div class="column">
		<Panel title="Budgets" subtitle="what each category was meant to take this month" soon />
		<Panel title="Repeating payments" subtitle="rent, SIPs and subscriptions" soon />
	</div>
</PanelGrid>

<PanelGrid>
	<SpendingDays daily={daily.data ?? []} account={url.query.account} />
	<SpendingAccounts
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

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}
</style>
