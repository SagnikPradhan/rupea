<script lang="ts">
	import type { TransactionView } from '#lib/endpoints/views.ts';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import TransactionRow from '#lib/web/components/app-transaction-row/app-transaction-row.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	type Props = {
		transactions: TransactionView[];
		/** Links each description to editing that transaction, by its line. */
		editable?: boolean;
		/** The line of the transaction being edited. */
		chosen?: number | null;
	};

	const { transactions, editable = false, chosen = null }: Props = $props();

	const editHref = (line: number) => hrefWith(page.url.searchParams, { edit: String(line) });

	const clickable = (line: number) => (group: HTMLElement) => {
		if (!editable) return;

		const open = (event: MouseEvent) => {
			if (event.target instanceof Element && event.target.closest('a')) return;
			void goto(editHref(line), { reset: false });
		};
		group.addEventListener('click', open);
		return () => group.removeEventListener('click', open);
	};
</script>

<div class="inset">
	<LedgerTable
		label="Transactions found"
		fixed
		scroll
		columns={[
			{ label: 'Date', kind: 'date' },
			{ label: 'From / To', kind: 'account', optional: true },
			{ label: 'Description' },
			{ label: 'Amount', kind: 'amount' },
		]}
	>
		{#each transactions as transaction (transaction.line)}
			<tbody
				class={{ chosen: transaction.line === chosen, editable }}
				{@attach clickable(transaction.line)}
			>
				<TransactionRow {transaction} href={editable ? editHref(transaction.line) : undefined} />
			</tbody>
		{/each}
	</LedgerTable>
</div>

<style>
	.editable {
		cursor: pointer;
	}

	.editable:hover :global(:is(th, td)),
	.chosen :global(:is(th, td)) {
		background: var(--color-subtle);
	}

	.editable :global(a) {
		color: inherit;
		text-decoration: none;
	}

	.inset :global(table :is(th, td):first-child) {
		padding-left: var(--size-2);
	}

	.inset :global(table :is(th, td):last-child) {
		padding-right: var(--size-2);
	}
</style>
