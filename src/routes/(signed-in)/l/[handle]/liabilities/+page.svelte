<script lang="ts">
	import { listAccounts, listDeltas, listTerms } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/ledger.remote.ts';
	import { ZERO, printAmount } from '#lib/shared/amounts.ts';
	import { paramsOf, periodOf, spansOf } from '#lib/shared/dates.ts';
	import { BalanceAccount, LIABILITIES } from '#lib/shared/accounts.ts';
	import { depthOf, isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import { formatBucket, formatIsoDate, formatWhole } from '#lib/web/shared/format.ts';
	import * as Liabilities from '#lib/web/shared/liabilities.ts';
	import { ringsOf } from '#lib/web/shared/rings.ts';
	import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import TermsForm from '#lib/web/components/app-terms-form/app-terms-form.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Donut from '#lib/web/components/ui-chart-donut/ui-chart-donut.svelte';
	import Timeline from '#lib/web/components/ui-chart-timeline/ui-chart-timeline.svelte';
	import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const SETTLED = { '': 'Open only', yes: 'Including settled' };

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const thisYear = { kind: 'year', at: day.slice(0, 4) } as const;
	const period = $derived(periodOf(page.url.searchParams, thisYear));
	const picked = $derived(v.parse(BalanceAccount, page.url.searchParams.get('account')));
	const account = $derived(picked !== null && isUnder(picked, LIABILITIES) ? picked : null);
	const settled = $derived(page.url.searchParams.get('settled') === 'yes');

	const [response, flowed, first, termed] = $derived(
		await Promise.all([
			listAccounts({ handle, day, period }),
			listDeltas({ handle, day, period, account: LIABILITIES }),
			findFirstDay(handle),
			listTerms({ handle, day }),
		]),
	);
	const moved = $derived(flowed.data?.[0]);
	const owed = $derived(Liabilities.accountsIn(response.data ?? []));
	const debts = $derived(Liabilities.debtsFrom(owed, termed.data ?? []));
	const shown = $derived(debts.filter((d) => isUnder(d.account, account)));
	const rows = $derived(Liabilities.rowsFor(shown, moved?.totals ?? [], settled));
	const from = $derived(moved?.from ?? today.with({ month: 1, day: 1 }));
	const bucket = $derived(moved?.bucket ?? 'month');
	const to = $derived(moved?.to ?? today.with({ month: 12, day: 31 }));
	const dues = $derived(debts.flatMap((d) => Liabilities.duesOn(d, { from: today, to })));
	const lines = $derived(Liabilities.linesFor(debts, moved?.deltas ?? [], dues, bucket));
	const end = $derived(spansOf(period, today).current.to);
	const interest = $derived(Liabilities.monthlyInterestOn(shown));
	const payoff = $derived(Liabilities.payoffOf(shown, end));
	const pins = $derived(lines.flatMap((l) => l.pins));
	const made = $derived(pins.filter((p) => p.past).length);
	const total = $derived(shown.find((a) => a.account === (account ?? LIABILITIES))?.owed ?? ZERO);
	const rings = $derived(ringsOf(owed, account ?? LIABILITIES));
	const credit = $derived(
		rings.skipped === 0
			? undefined
			: `${rings.skipped} ${rings.skipped === 1 ? 'account is' : 'accounts are'} in credit, so not drawn`,
	);

	const setup = $derived.by(() => {
		const asked = v.parse(BalanceAccount, page.url.searchParams.get('setup'));
		return asked !== null && isUnder(asked, LIABILITIES) ? asked : null;
	});
	const current = $derived(
		termed.data?.find((t) => t.account.toLowerCase() === setup?.toLowerCase())?.current ?? {},
	);
	const fresh = $state({ name: '' });
	const setupHref = (a: string | null) => hrefWith(page.url.searchParams, { setup: a ?? '' });

	const postingsOf = (a: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account: a, ...paramsOf(period) })}`;
</script>

<PageHeader subtitle="What you owe, what is due, and when it ends">
	Liabilities
	{#snippet actions()}
		<ListFilter
			{period}
			{account}
			accounts={owed}
			today={day}
			first={first.data ?? null}
			moreParams={['settled']}
		>
			{#snippet more()}
				<FilterSection label="Accounts">
					<ChoiceChips
						param="settled"
						label="Settled accounts"
						choices={SETTLED}
						current={settled ? 'yes' : ''}
					/>
				</FilterSection>
			{/snippet}
		</ListFilter>
	{/snippet}
</PageHeader>

<Issues {handle} errors={[...(response.errors ?? []), ...(flowed.errors ?? [])]} />

<PanelGrid narrow>
	<Panel title="Payments" subtitle="{made} made · {pins.length - made} still to fall due">
		{#if lines.length > 0}
			<Timeline
				{lines}
				{from}
				{to}
				{bucket}
				{today}
				label="The payments made and due on each account"
			/>
		{:else}
			<p>No payments in this period.</p>
		{/if}
	</Panel>
	<KpiStrip>
		<Kpi label="Due in 30 days" soon />
		<Kpi
			label="Loan interest a month"
			figure={interest === null ? '–' : `about ${formatWhole(printAmount(interest))}`}
		/>
		<Kpi label="Card limit used" soon />
		<Kpi
			label="Loans paid off by"
			figure={payoff === null ? '–' : formatBucket.month(payoff.toString())}
		/>
	</KpiStrip>
</PanelGrid>

<PanelGrid>
	<div class="column">
		<Panel title="What you owe" subtitle="owed by loan and card, the inner ring the groups">
			{#if rings.arcs.length > 0}
				<Donut
					arcs={rings.arcs}
					levels={rings.levels}
					label="How what is owed divides across its accounts"
					amounts
					note={credit}
				/>
			{:else}
				<p>Nothing owed.</p>
			{/if}
		</Panel>
		<Panel
			title="When each loan ends"
			subtitle="how much of each loan is paid, and the year it ends"
			soon
		/>
	</div>
	<div class="column">
		<Panel title="Card balance" subtitle="the average balance of the cards, by month" soon />
		<Panel title="Card limits" subtitle="used out of each card’s limit" soon />
	</div>
</PanelGrid>

<PanelGrid wide>
	<Panel
		title="All liabilities"
		subtitle="{rows.length} {rows.length === 1 ? 'account' : 'accounts'} · {formatWhole(
			printAmount(total),
		)} owed"
	>
		{#if rows.length > 0}
			<LedgerTable
				columns={[
					{ label: 'Account' },
					{ label: 'Owed', kind: 'amount' },
					{ label: 'Paid down', kind: 'amount' },
					{ label: 'Rate', kind: 'amount' },
					{ label: 'Monthly', kind: 'amount' },
					{ label: 'Due', kind: 'amount' },
					{ label: 'Terms' },
				]}
			>
				<tbody>
					{#each rows as row (row.account)}
						<tr>
							<th scope="row">
								<a href={postingsOf(row.account)} title={row.account}
									><AccountName account={row.account} depth={depthOf(row.account) - 1} /></a
								>
								{#if row.unpriced > 0}<Tag>{row.unpriced} unpriced</Tag>{/if}
							</th>
							<Amount value={printAmount(row.owed)} />
							<Amount value={printAmount(row.paid)} signed />
							<td class="amount">{row.rate === null ? '' : `${row.rate}%`}</td>
							<Amount value={printAmount(row.payment)} />
							<td class="amount">{row.due ?? ''}</td>
							<td class="nowrap"
								><a href={setupHref(row.account)}>{row.setUp ? 'Edit' : 'Set up'}</a></td
							>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr>
						<th scope="row">Total</th>
						<Amount value={printAmount(total)} />
						<Amount value={null} />
					</tr>
				</tfoot>
			</LedgerTable>
		{:else}
			<p>Nothing owed.</p>
		{/if}
	</Panel>
	{#if setup}
		<Aside title="Set up {nameOf(setup)}" onclose={() => goto(setupHref(null))}>
			{#key setup}
				<TermsForm
					{handle}
					account={setup}
					{current}
					onsaved={() => listTerms({ handle, day }).refresh()}
				/>
			{/key}
		</Aside>
	{:else}
		<Aside title="Add a liability" closeBeside={false} onclose={() => {}}>
			<div class="add">
				<Field label="Name" hint="Under Liabilities, like Loans:Car or Cards:Regalia.">
					<input bind:value={fresh.name} />
				</Field>
				<TermsForm
					{handle}
					account="Liabilities:{fresh.name.trim()}"
					current={{}}
					onsaved={() => listTerms({ handle, day }).refresh()}
				/>
			</div>
		</Aside>
	{/if}
</PanelGrid>

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	input {
		width: 100%;
	}

	.nowrap {
		white-space: nowrap;
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
