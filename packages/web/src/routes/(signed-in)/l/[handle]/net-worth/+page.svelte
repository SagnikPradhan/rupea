<script lang="ts">
	import {
		listHoldings,
		listDeltas,
		listDrops,
		listInvested,
		listReturns,
		listTerms,
		listWorth,
	} from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/ledger.remote.ts';
	import { printAmount, sum, ASSETS, BalanceAccount, LIABILITIES } from '@rupea/shared/money.ts';
	import { spansOf } from '@rupea/shared/dates.ts';
	import { paramsOf } from '#lib/web/shared/filter.ts';
	import { depthOf, isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import {
		formatAmount,
		formatBucket,
		formatExact,
		formatIsoDate,
		formatPercent,
		formatReturn,
		formatShare,
		formatWhole,
		toneOf,
	} from '#lib/web/shared/format.ts';
	import { owedOf } from '#lib/web/shared/home.ts';
	import * as Liabilities from '#lib/web/shared/liabilities.ts';
	import { ringsOf } from '#lib/web/shared/rings.ts';
	import AccountsTable from '#lib/web/components/app-accounts-table/app-accounts-table.svelte';
	import Drops from '#lib/web/components/app-drops/app-drops.svelte';
	import AssetsRings from '#lib/web/components/app-assets-rings/app-assets-rings.svelte';
	import BalanceSheet from '#lib/web/components/app-balance-sheet/app-balance-sheet.svelte';
	import NetWorth from '#lib/web/components/app-net-worth/app-net-worth.svelte';
	import InvestedReturns from '#lib/web/components/app-invested-returns/app-invested-returns.svelte';
	import InvestedRisk from '#lib/web/components/app-invested-risk/app-invested-risk.svelte';
	import Invested from '#lib/web/components/app-invested/app-invested.svelte';
	import { BalanceQuery, groupsInvested, investedOf, totalsOf } from '#lib/web/shared/invested.ts';
	import { readQuery } from '#lib/web/shared/query.svelte.ts';
	import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import TermsForm from '#lib/web/components/app-terms-form/app-terms-form.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Donut from '#lib/web/components/ui-chart-donut/ui-chart-donut.svelte';
	import Timeline from '#lib/web/components/ui-chart-timeline/ui-chart-timeline.svelte';
	import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PageSection from '#lib/web/components/ui-page-section/ui-page-section.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { hrefWith, postingsHref } from '#lib/web/shared/links.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const SETTLED = { '': 'Including settled', no: 'Open only' };

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const url = readQuery(BalanceQuery(day));
	const period = $derived(url.query.period);
	const picked = $derived(url.query.account);
	const account = $derived(picked !== null && isUnder(picked, LIABILITIES) ? picked : null);
	const settled = $derived(page.url.searchParams.get('settled') !== 'no');

	const [response, earned, first, owned, fallen, worthy] = $derived(
		await Promise.all([
			listHoldings({ handle, day, period }),
			listReturns({ handle, day, period }),
			findFirstDay(handle),
			listInvested({ handle, day, period, account: picked }),
			listDrops({ handle, day, period, account: picked }),
			listWorth({ handle, day, period, account: picked }),
		]),
	);
	const [flowed, termed] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period, account: LIABILITIES }),
			listTerms({ handle, day }),
		]),
	);
	const accounts = $derived(response.data ?? []);
	const held = $derived(accounts.filter((a) => isUnder(a.account, ASSETS)));
	const returns = $derived(Object.fromEntries((earned.data ?? []).map((r) => [r.account, r])));
	const invested = $derived(investedOf(accounts, returns));
	const heldRings = $derived(
		ringsOf(accounts, picked !== null && isUnder(picked, ASSETS) ? picked : ASSETS),
	);

	const worth = $derived(worthy.data ?? []);
	const latest = $derived(worth.at(-1));
	const totals = $derived(totalsOf(groupsInvested(invested)));

	const moved = $derived(flowed.data?.[0]);
	const owed = $derived(Liabilities.accountsIn(accounts));
	const debts = $derived(Liabilities.debtsFrom(owed, termed.data ?? []));
	const shown = $derived(debts.filter((d) => isUnder(d.account, account)));
	const rows = $derived(Liabilities.rowsFor(shown, moved?.totals ?? [], settled));
	const from = $derived(moved?.from ?? today.with({ month: 1, day: 1 }));
	const bucket = $derived(moved?.bucket ?? 'month');
	const to = $derived(moved?.to ?? today.with({ month: 12, day: 31 }));
	const dues = $derived(shown.flatMap((d) => Liabilities.duesOn(d, { from: today, to })));
	const lines = $derived(Liabilities.linesFor(shown, moved?.deltas ?? [], dues, bucket));
	const end = $derived(spansOf(period, today).current.to);
	const soon = $derived(today.add({ days: 30 }));
	const dueSoon = $derived(
		sum(
			shown.flatMap((d) => Liabilities.duesOn(d, { from: today, to: soon })).map((d) => d.amount),
		),
	);
	const interest = $derived(Liabilities.monthlyInterestOn(shown));
	const payoff = $derived(Liabilities.payoffOf(shown, end));
	const payments = $derived(Liabilities.paymentsOn(lines));
	const total = $derived(Liabilities.owedOn(shown, account ?? LIABILITIES));
	const owedRings = $derived(ringsOf(owed, account ?? LIABILITIES));
	const credit = $derived(
		owedRings.skipped === 0
			? undefined
			: `${owedRings.skipped} ${owedRings.skipped === 1 ? 'account is' : 'accounts are'} in credit, so not drawn`,
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

	const postingsOf = (a: string) => postingsHref(handle, { account: a, ...paramsOf(period) });
</script>

<PageHeader subtitle="What you are worth, and how it has grown">
	Net worth
	{#snippet actions()}
		<ListFilter {period} account={picked} {accounts} today={day} first={first.data ?? null} />
	{/snippet}
</PageHeader>

<Issues
	{handle}
	errors={[
		...(response.errors ?? []),
		...(earned.errors ?? []),
		...(owned.errors ?? []),
		...(fallen.errors ?? []),
		...(flowed.errors ?? []),
		...(worthy.errors ?? []),
	]}
/>

<PanelGrid narrow>
	<div>
		{#if worth.length > 0}
			<NetWorth {worth} />
		{:else}
			<p>Nothing held in this period.</p>
		{/if}
	</div>

	<KpiStrip label="Net worth figures">
		<Kpi label="Owned" figure={formatWhole(latest?.assets ?? '0')} />
		<Kpi
			label="Owed"
			figure={formatWhole(owedOf(latest?.liabilities ?? '0'))}
			detail="{formatShare(owedOf(latest?.liabilities ?? '0'), latest?.assets ?? '0') ??
				'0%'} of what you own"
		/>
		<Kpi
			label="Gain"
			figure={formatWhole(String(totals.gain))}
			detail="{formatReturn(String(totals.gain), String(totals.cost)) ?? '0%'} on cost"
			tone={toneOf(totals.gain)}
		/>
		<Kpi
			label="Return a year"
			figure={totals.xirr === null ? '0%' : formatPercent(totals.xirr)}
			detail="on what is invested"
		/>
	</KpiStrip>
</PanelGrid>

<PageSection id="owned">
	<PanelGrid>
		<div class="column">
			{#if (owned.data ?? []).length > 0}
				<Invested invested={owned.data ?? []} />
			{/if}
			<InvestedReturns {invested} />

			<Panel title="Biggest drops" subtitle="how far investments fell from their high">
				{#if fallen.data?.[0]}
					<Drops drops={fallen.data[0]} account={picked} />
				{:else}
					<p>Needs price history.</p>
				{/if}
			</Panel>
		</div>

		<div class="column">
			<AssetsRings rings={heldRings} account={picked} />

			<InvestedRisk
				{invested}
				swings={fallen.data?.[0]?.swings ?? []}
				arcs={heldRings.arcs}
				account={picked}
			/>
		</div>
	</PanelGrid>

	<AccountsTable accounts={held} {returns} under={picked} {handle} />
</PageSection>

<PageSection id="owed">
	<PanelGrid narrow>
		<div>
			<ChartSummary
				id="payments"
				label="Owed"
				figure={formatAmount(printAmount(total))}
				exact={formatExact(printAmount(total))}
			>
				{payments.made}
				{payments.made === 1 ? 'payment' : 'payments'} made · {payments.due} still to fall due
			</ChartSummary>
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
		</div>
		<KpiStrip label="Debt figures">
			<Kpi label="Due in 30 days" figure={formatWhole(printAmount(dueSoon))} />
			<Kpi
				label="Loan interest a month"
				figure={interest === null ? '–' : `about ${formatWhole(printAmount(interest))}`}
			/>
			<Kpi
				label="Loans paid off by"
				figure={payoff === null ? '–' : formatBucket.month(payoff.toString())}
			/>
		</KpiStrip>
	</PanelGrid>

	<PanelGrid>
		<Panel title="What you owe" subtitle="owed by loan and card, the inner ring the groups">
			{#if owedRings.arcs.length > 0}
				<Donut
					arcs={owedRings.arcs}
					levels={owedRings.levels}
					label="How what is owed divides across its accounts"
					amounts
					note={credit}
				/>
			{:else}
				<p>Nothing owed.</p>
			{/if}
		</Panel>
		<BalanceSheet {accounts} worth={latest} {day} />
	</PanelGrid>

	<PanelGrid wide>
		<Panel
			title="All liabilities"
			subtitle="{rows.length} {rows.length === 1 ? 'account' : 'accounts'} · {formatWhole(
				printAmount(total),
			)} owed"
		>
			{#snippet actions()}
				<ChoiceChips
					param="settled"
					label="Settled accounts"
					choices={SETTLED}
					current={settled ? '' : 'no'}
				/>
			{/snippet}
			{#if rows.length > 0}
				<LedgerTable
					columns={[
						{ label: 'Account' },
						{ label: 'Owed', kind: 'amount' },
						{ label: 'Drawn', kind: 'amount' },
						{ label: 'Paid', kind: 'amount' },
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
									<a href={postingsOf(row.account)} title={row.account}>
										<AccountName account={row.account} depth={depthOf(row.account) - 1} />
									</a>
									{#if row.unpriced > 0}<Tag>{row.unpriced} unpriced</Tag>{/if}
								</th>
								<Amount value={printAmount(row.owed)} />
								<Amount value={printAmount(row.drawn)} />
								<Amount value={printAmount(row.paid)} />
								<td class="amount">{row.rate === null ? '' : `${row.rate}%`}</td>
								<Amount value={printAmount(row.payment)} />
								<td class="amount">{row.due ?? ''}</td>
								<td class="nowrap">
									{#if row.leaf}<a href={setupHref(row.account)}>
											{row.setUp ? 'Edit' : 'Set up'}
										</a>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<th scope="row">Total</th>
							<Amount value={printAmount(total)} />
							<Amount value={null} />
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
</PageSection>

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-4);
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
