<script lang="ts">
	import { getTransactions } from '#lib/endpoints/transactions.remote.ts';
	import type { RupeeError } from '#lib/server/shared/result/error.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import { formatAmount, formatDate } from '#lib/web/format.ts';
	import { fileHref } from '#lib/web/links.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const response = $derived(await getTransactions(handle));

	// Assertions only check the ledger; nothing is wrong with the data they point at.
	const isWarning = (e: RupeeError) =>
		e.type === 'BalanceAssertionFailed' || e.type === 'BalanceAssertionAmbiguous';
	const problems = $derived(response.errors.filter((e) => !isWarning(e)));
	const warnings = $derived(response.errors.filter(isWarning));
</script>

<h1>Transactions</h1>

<Issues {handle} errors={problems} />
<Issues {handle} errors={warnings} warning />

<table>
	<colgroup>
		<col class="date" />
		<col />
		<col class="amount" />
	</colgroup>
	<thead>
		<tr><th>Date</th><th>Description</th><th>Amount</th></tr>
	</thead>
	{#each response.data ?? [] as transaction (transaction.id)}
		<tbody class:evidence={!transaction.counted}>
			<tr>
				<td>
					<time datetime={transaction.date}>{formatDate(transaction.date)}</time>
					{#if transaction.time}<span>{transaction.time}</span>{/if}
				</td>
				<td class="description" title={transaction.description}>
					{#if !transaction.counted}<span class="tag">evidence</span>{/if}
					{transaction.description}
				</td>
				<td class="source">
					<a
						href={fileHref(handle, transaction.file, transaction.line)}
						aria-label="{transaction.file}:{transaction.line}"
						title="{transaction.file}:{transaction.line}"
					>
						<span>{transaction.file.split('/').at(-1)}</span>:{transaction.line}
					</a>
				</td>
			</tr>
			{#each transaction.postings as posting, index (index)}
				<tr class="posting">
					<td></td>
					<td>
						{#each posting.account.split(':') as part, i (i)}{i > 0 ? ':' : ''}<wbr />{part}{/each}
					</td>
					<td class="amount" class:negative={posting.quantity.startsWith('-')}>
						{formatAmount(posting.quantity)}
					</td>
				</tr>
			{/each}
		</tbody>
	{/each}
</table>

<style>
	table {
		width: 100%;
		margin-top: var(--size-3);
		border-collapse: collapse;
		table-layout: fixed;
		font-size: var(--font-size-0);
	}

	col.date {
		width: var(--size-6);
	}

	col.amount {
		width: var(--size-7);
	}

	th,
	td {
		padding: 0 0 0 var(--size-3);
		vertical-align: baseline;
	}

	th:first-child,
	td:first-child {
		padding-left: 0;
	}

	th:nth-child(2),
	td.description {
		padding-left: var(--size-1);
	}

	th {
		padding-bottom: var(--size-2);
		border-bottom: 1px solid var(--color-border);
		color: var(--color-muted);
		font-weight: 400;
		text-align: left;
	}

	th:last-child,
	.source,
	.amount {
		text-align: right;
	}

	tbody tr:first-child td {
		padding-top: var(--size-2);
	}

	tbody tr:last-child td {
		padding-bottom: var(--size-2);
	}

	.posting td {
		padding-top: var(--size-0);
	}

	tbody + tbody tr:first-child td {
		border-top: 1px solid var(--color-subtle);
	}

	.description,
	.source span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.description {
		font-weight: 500;
	}

	.posting td:nth-child(2) {
		padding-left: var(--size-3);
		color: var(--color-muted);
		overflow-wrap: break-word;
	}

	td span,
	.source {
		color: var(--color-muted);
	}

	.source a {
		display: flex;
		justify-content: end;
		color: inherit;
		text-decoration: none;
		font-family: var(--font-mono);
	}

	.source a:hover {
		text-decoration: underline;
	}

	.tag {
		margin-right: var(--size-1);
		padding: 0 var(--size-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-weight: 400;
	}

	.amount {
		white-space: nowrap;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.negative {
		color: var(--color-negative);
	}

	.evidence {
		opacity: 0.6;
	}

	@media (width < 40rem) {
		col.amount {
			width: var(--size-6);
		}

		th,
		td {
			padding-left: var(--size-2);
		}

		.posting td:nth-child(2) {
			padding-left: var(--size-2);
		}

		.source a {
			display: none;
		}
	}
</style>
