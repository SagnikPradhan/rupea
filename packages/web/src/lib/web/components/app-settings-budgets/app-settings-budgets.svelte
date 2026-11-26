<script lang="ts">
	import { listAccounts, listBudgets } from '#lib/endpoints/accounts.remote.ts';
	import { EXPENSES, printAmount } from '@rupea/shared/money.ts';
	import BudgetForm from '#lib/web/components/app-budget-form/app-budget-form.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import PageSection from '#lib/web/components/ui-page-section/ui-page-section.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import { formatIsoDate, formatWhole } from '#lib/web/shared/format.ts';
	import { settingsHref } from '#lib/web/shared/links.ts';
	import { askedIn } from '#lib/web/shared/settings.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	type Props = { ledger: { handle: string; name: string } };

	const { ledger }: Props = $props();

	const handle = $derived(ledger.handle);
	const day = formatIsoDate(new Date());
	const shown = { from: day, to: day };

	const [accounts, budgets] = $derived(
		await Promise.all([listAccounts(handle), listBudgets({ handle, from: day, day })]),
	);
	const budgeted = $derived((budgets.data ?? []).map((b) => b.account.toLowerCase()));
	const expenses = $derived(
		(accounts.data ?? [])
			.map((a) => a.account)
			.filter((a) => a !== EXPENSES && isUnder(a, EXPENSES))
			.filter((a) => !budgeted.includes(a.toLowerCase())),
	);

	const asked = $derived(askedIn(page.url.searchParams, handle));
	const budget = $derived(
		(budgets.data ?? []).find(
			(b) => b.account.toLowerCase() === asked.get('budget')?.toLowerCase(),
		),
	);
	const adding = $derived(asked.get('add') === 'budget');

	const open = $derived(budget !== undefined || adding);

	const close = () => goto(settingsHref(handle, { budget: '' }));
</script>

<PageSection id="{handle}-budgets">
	<PanelGrid wide={open} full={!open}>
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
			<Aside title="Budget for {nameOf(budget.account)}" onclose={close}>
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
		{#if !budget && adding}
			<Aside title="Add budget" onclose={close}>
				<BudgetForm {handle} {day} {shown} account="" accounts={expenses} current={{}} />
			</Aside>
		{/if}
	</PanelGrid>
</PageSection>

<Issues {handle} errors={[...(accounts.errors ?? []), ...(budgets.errors ?? [])]} />
