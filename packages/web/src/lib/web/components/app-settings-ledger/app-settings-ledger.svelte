<script lang="ts">
	import { listAccounts, listBudgets, listTerms } from '#lib/endpoints/accounts.remote.ts';
	import {
		BalanceAccount,
		EXPENSES,
		LIABILITIES,
		parseAmount,
		printAmount,
	} from '@rupea/shared/money.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import BudgetForm from '#lib/web/components/app-budget-form/app-budget-form.svelte';
	import TermsForm from '#lib/web/components/app-terms-form/app-terms-form.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import PageSection from '#lib/web/components/ui-page-section/ui-page-section.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import { formatIsoDate, formatWhole } from '#lib/web/shared/format.ts';
	import { settingsHref } from '#lib/web/shared/links.ts';
	import { liabilitiesOf, type Liability } from '#lib/web/shared/settings.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as v from 'valibot';

	type Props = { ledger: { handle: string; name: string } };

	const { ledger }: Props = $props();

	const handle = $derived(ledger.handle);
	const day = formatIsoDate(new Date());
	const shown = { from: day, to: day };

	const [accounts, termed, budgets] = $derived(
		await Promise.all([
			listAccounts(handle),
			listTerms({ handle, day }),
			listBudgets({ handle, from: day, day }),
		]),
	);
	const groups = $derived(liabilitiesOf(accounts.data ?? [], termed.data ?? []));
	const budgeted = $derived((budgets.data ?? []).map((b) => b.account.toLowerCase()));
	const expenses = $derived(
		(accounts.data ?? [])
			.map((a) => a.account)
			.filter((a) => a !== EXPENSES && isUnder(a, EXPENSES))
			.filter((a) => !budgeted.includes(a.toLowerCase())),
	);

	const asked = $derived(
		page.url.searchParams.get('ledger') === handle ? page.url.searchParams : new URLSearchParams(),
	);
	const setup = $derived.by(() => {
		const account = v.parse(BalanceAccount, asked.get('setup'));
		return account !== null && isUnder(account, LIABILITIES) ? account : null;
	});
	const current = $derived(
		termed.data?.find((t) => t.account.toLowerCase() === setup?.toLowerCase())?.current ?? {},
	);
	const budget = $derived(
		(budgets.data ?? []).find(
			(b) => b.account.toLowerCase() === asked.get('budget')?.toLowerCase(),
		),
	);
	const adding = $derived(asked.get('add'));
	const fresh = $state({ name: '' });

	const termsOpen = $derived(setup !== null || adding === 'terms');
	const budgetOpen = $derived(budget !== undefined || adding === 'budget');

	const refreshTerms = () => listTerms({ handle, day }).refresh();
	const closeTerms = () => goto(settingsHref(handle, {}));
	const closeBudget = () => goto(settingsHref(handle, { budget: '' }));

	const whole = (written: string | undefined) => {
		const parsed = written === undefined ? null : parseAmount(written);
		return parsed === null ? (written ?? '') : formatWhole(printAmount(parsed));
	};
	const dayOf = (d: number | undefined) => (d === undefined ? '' : String(d));
	const rateOf = (r: number | undefined) => (r === undefined ? '' : `${r}%`);
	const setupOf = (l: Liability) => settingsHref(handle, { setup: l.account });
</script>

<PageSection id="{handle}-accounts">
	<PanelGrid wide={termsOpen} full={!termsOpen}>
		<div class="tables">
			<Panel title="Cards" subtitle="Each card's limit and days in {ledger.name}">
				{#snippet actions()}
					<Button href={settingsHref(handle, { add: 'terms' })}>Add a card or loan</Button>
				{/snippet}
				{#if groups.cards.length > 0}
					<LedgerTable
						label="Cards in {ledger.name}"
						columns={[
							{ label: 'Card' },
							{ label: 'Limit', kind: 'amount' },
							{ label: 'Statement day', kind: 'amount' },
							{ label: 'Due day', kind: 'amount' },
							{ label: 'Rate', kind: 'amount' },
							{ label: 'Terms' },
						]}
					>
						<tbody>
							{#each groups.cards as l (l.account)}
								{@const held = l.terms?.held?.kind === 'card' ? l.terms.held : null}
								<tr>
									<th scope="row" title={l.account}>{nameOf(l.account)}</th>
									<td class="amount">{whole(held?.limit)}</td>
									<td class="amount">{dayOf(held?.statement)}</td>
									<td class="amount">{dayOf(held?.due)}</td>
									<td class="amount">{rateOf(held?.rate)}</td>
									<td><a href={setupOf(l)} aria-label="Edit {l.account}">Edit</a></td>
								</tr>
							{/each}
						</tbody>
					</LedgerTable>
				{:else}
					<p>No cards set up.</p>
				{/if}
			</Panel>

			<Panel title="Loans" subtitle="Each loan's rate and payment in {ledger.name}">
				{#if groups.loans.length > 0}
					<LedgerTable
						label="Loans in {ledger.name}"
						columns={[
							{ label: 'Loan' },
							{ label: 'Rate', kind: 'amount' },
							{ label: 'Monthly', kind: 'amount' },
							{ label: 'Due day', kind: 'amount' },
							{ label: 'Terms' },
						]}
					>
						<tbody>
							{#each groups.loans as l (l.account)}
								{@const held = l.terms?.held?.kind === 'loan' ? l.terms.held : null}
								<tr>
									<th scope="row" title={l.account}>{nameOf(l.account)}</th>
									<td class="amount">{rateOf(held?.rate)}</td>
									<td class="amount">{whole(held?.payment)}</td>
									<td class="amount">{dayOf(held?.due)}</td>
									<td><a href={setupOf(l)} aria-label="Edit {l.account}">Edit</a></td>
								</tr>
							{/each}
						</tbody>
					</LedgerTable>
				{:else}
					<p>No loans set up.</p>
				{/if}
			</Panel>

			{#if groups.unset.length > 0}
				<Panel title="Not set up" subtitle="Say whether each is a card or a loan">
					<LedgerTable
						label="Not set up in {ledger.name}"
						columns={[{ label: 'Account' }, { label: 'Terms' }]}
					>
						<tbody>
							{#each groups.unset as l (l.account)}
								<tr>
									<th scope="row">{l.account}</th>
									<td><a href={setupOf(l)} aria-label="Set up {l.account}">Set up</a></td>
								</tr>
							{/each}
						</tbody>
					</LedgerTable>
				</Panel>
			{/if}
		</div>

		{#if setup}
			<Aside title="Set up {nameOf(setup)}" onclose={closeTerms}>
				{#key setup}
					<TermsForm {handle} account={setup} {current} onsaved={refreshTerms} />
				{/key}
			</Aside>
		{/if}
		{#if !setup && adding === 'terms'}
			<Aside title="Add a card or loan" onclose={closeTerms}>
				<div class="add">
					<Field label="Name" hint="Under Liabilities, like Loans:Car or Cards:Regalia.">
						<input bind:value={fresh.name} />
					</Field>
					<TermsForm
						{handle}
						account="Liabilities:{fresh.name.trim()}"
						current={{}}
						onsaved={refreshTerms}
					/>
				</div>
			</Aside>
		{/if}
	</PanelGrid>
</PageSection>

<PageSection id="{handle}-budgets">
	<PanelGrid wide={budgetOpen} full={!budgetOpen}>
		<Panel title="Budgets" subtitle="What each category may spend in {ledger.name}">
			{#snippet actions()}
				<Button href={settingsHref(handle, { add: 'budget' })}>Add budget</Button>
			{/snippet}
			{#if (budgets.data ?? []).length > 0}
				<LedgerTable
					label="Budgets in {ledger.name}"
					columns={[
						{ label: 'Budget' },
						{ label: 'Limit', kind: 'amount' },
						{ label: 'Period' },
						{ label: 'Terms' },
					]}
				>
					<tbody>
						{#each budgets.data ?? [] as b (b.account)}
							<tr>
								<th scope="row" title={b.account}>{b.account}</th>
								<td class="amount">{formatWhole(printAmount(b.limit))}</td>
								<td>{b.length === 'year' ? 'Each year' : 'Each month'}</td>
								<td>
									<a
										href={settingsHref(handle, { budget: b.account })}
										aria-label="Edit {b.account}"
									>
										Edit
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</LedgerTable>
			{:else}
				<p>No budgets yet.</p>
			{/if}
		</Panel>

		{#if budget}
			<Aside title="Budget for {nameOf(budget.account)}" onclose={closeBudget}>
				{#key budget.account}
					<BudgetForm
						{handle}
						{day}
						{shown}
						account={budget.account}
						accounts={[]}
						current={budget.current}
					/>
				{/key}
			</Aside>
		{/if}
		{#if !budget && adding === 'budget'}
			<Aside title="Add budget" onclose={closeBudget}>
				<BudgetForm {handle} {day} {shown} account="" accounts={expenses} current={{}} />
			</Aside>
		{/if}
	</PanelGrid>
</PageSection>

<Issues
	{handle}
	errors={[...(accounts.errors ?? []), ...(termed.errors ?? []), ...(budgets.errors ?? [])]}
/>

<style>
	.tables {
		display: flex;
		flex-direction: column;
		gap: var(--size-4);
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}
</style>
