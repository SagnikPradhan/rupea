<script lang="ts">
	import Account from '#lib/web/components/app-ledger-table/account.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import type { ResolvedPathname } from '$app/types';
	import { rowOf } from '#lib/web/shared/transaction-row.ts';
	import type { PostedOut } from '@rupea/shared/money.ts';

	const formats = formatsHere();

	type Props = {
		transaction: {
			date: string;
			time: string | null;
			description: string;
			comment: string | null;
			postings: { account: string; quantity: PostedOut }[];
		};
		/** Where the description leads; plain text without it. */
		href?: ResolvedPathname | undefined;
		/** Whether the transaction only backs up another, and does not count. */
		evidence?: boolean;
	};

	const { transaction, href, evidence = false }: Props = $props();

	const { from, to, more, amount } = $derived(rowOf(transaction.postings));
</script>

<tr class:evidence>
	<td class="date">
		<time datetime={transaction.date}>{formats.date(transaction.date)}</time>
		{#if transaction.time}<span>{transaction.time}</span>{/if}
	</td>
	<td class="optional truncate">
		<div class="line">
			<span class="name">
				{#if from}<Account account={from.account} />{/if}
			</span>
		</div>
		<div class="line">
			<span class="name">
				{#if to}<Account account={to.account} />{/if}
			</span>
			{#if more > 0}<Tag>+{more}</Tag>{/if}
		</div>
	</td>
	<th
		scope="row"
		class="description"
		title={[transaction.description, transaction.comment].filter(Boolean).join('\n')}
	>
		<div class="cell">
			{#if href}
				<a {href} data-sveltekit-reset="false">{transaction.description}</a>
			{:else}
				{transaction.description}
			{/if}
			{#if evidence}<Tag>evidence</Tag>{/if}
			{#if transaction.comment}<span class="comment">; {transaction.comment}</span>{/if}
		</div>
	</th>
	<Amount value={amount} />
</tr>

<style>
	td span,
	.comment {
		color: var(--color-muted);
	}

	.line {
		display: flex;
		align-items: baseline;
		gap: var(--size-0) var(--size-2);
	}

	.name {
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	.cell {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--size-0) var(--size-2);
	}

	.evidence :is(td, th, a) {
		color: var(--color-muted);
	}
</style>
