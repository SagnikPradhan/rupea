<script lang="ts">
	import { listAccounts, listBudgets } from '#lib/endpoints/accounts.remote.ts';
	import { EXPENSES, printAmount } from '@rupea/shared/money.ts';
	import BudgetForm from '#lib/web/components/app-budget-form/app-budget-form.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import SettingEditor from '#lib/web/components/ui-setting-editor/ui-setting-editor.svelte';
	import Setting from '#lib/web/components/ui-setting/ui-setting.svelte';
	import { isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import { formatsHere, formatIsoDate } from '#lib/web/shared/format.ts';
	import { settingsHref } from '#lib/web/shared/links.ts';
	import { askedIn } from '#lib/web/shared/settings.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	type Props = { ledger: { handle: string; name: string } };

	const { ledger }: Props = $props();

	const formats = formatsHere();

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

<Setting id="{handle}-budgets" title="Budgets" hint="What each category may spend.">
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
						<td class="amount">{formats.whole(printAmount(b.limit))}</td>
						<td>{b.length === 'year' ? 'Each year' : 'Each month'}</td>
						<td>
							<a href={settingsHref(handle, { budget: b.account })} aria-label="Edit {b.account}">
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

	{#if budget}
		<SettingEditor title="Budget for {nameOf(budget.account)}">
			{#key budget.account}
				<BudgetForm
					{handle}
					{day}
					{shown}
					account={budget.account}
					accounts={[]}
					current={budget.current}
					oncancel={close}
				/>
			{/key}
		</SettingEditor>
	{/if}
	{#if !budget && adding}
		<SettingEditor title="Add budget">
			<BudgetForm
				{handle}
				{day}
				{shown}
				account=""
				accounts={expenses}
				current={{}}
				oncancel={close}
			/>
		</SettingEditor>
	{/if}
	{#if !open}<Button href={settingsHref(handle, { add: 'budget' })}>Add budget</Button>{/if}

	<Issues {handle} errors={[...(accounts.errors ?? []), ...(budgets.errors ?? [])]} />
</Setting>
