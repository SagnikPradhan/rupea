<script lang="ts">
	import { parseFile } from '#lib/endpoints/files.remote.ts';
	import type { Reply } from '@rupea/shared/errors.ts';
	import type { TransactionView } from '#lib/endpoints/views.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import TransactionsFound from '#lib/web/components/app-transactions-found/app-transactions-found.svelte';
	import { untrack } from 'svelte';

	type Props = {
		handle: string;
		file: string;
		/** The file as it is saved, which is what a transaction's line counts in. */
		content: string;
		/** The line of the transaction being edited. */
		at: number | null;
		/** Whether the file has text edits that are not saved. */
		unsaved: boolean;
	};

	const { handle, file, content, at, unsaved }: Props = $props();

	const read = $state({ ticket: 0, found: null as Reply<TransactionView[]> | null });
	const transactions = $derived(read.found?.data ?? []);

	// Untracked: the command updates its own pending state, which would re-run this effect.
	$effect(() => {
		const text = content;
		untrack(() => void parse(text));
	});

	async function parse(text: string) {
		const ticket = ++read.ticket;
		const found = await parseFile({ handle, key: file, content: text });
		if (ticket === read.ticket) read.found = found;
	}
</script>

{#if unsaved}
	<p class="hint">Showing the saved file. Your unsaved text edits are in the File view.</p>
{/if}

<Issues {handle} errors={read.found?.errors ?? []} detailed />

{#if transactions.length > 0}
	<TransactionsFound {transactions} chosen={at} editable />
{/if}
{#if read.found && transactions.length === 0}
	<p class="hint">No transactions in this file.</p>
{/if}

<style>
	.hint {
		margin: 0;
		color: var(--color-muted);
	}
</style>
