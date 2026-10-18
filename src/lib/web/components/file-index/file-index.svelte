<script lang="ts">
	import { getFiles } from '#lib/endpoints/files.remote.ts';
	import FilePath from '#lib/web/components/file-path/file-path.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import { formatMoment, formatSize } from '#lib/web/format.ts';
	import { fileHref } from '#lib/web/links.ts';

	const { handle }: { handle: string } = $props();

	const response = $derived(await getFiles(handle));
	const files = $derived((response.data ?? []).toSorted((a, b) => a.key.localeCompare(b.key)));
</script>

{#if files.length === 0}
	<p>No files yet.</p>
{:else}
	<LedgerTable
		columns={[
			{ label: 'File' },
			{ label: 'Modified', kind: 'date' },
			{ label: 'Size', kind: 'amount' },
		]}
	>
		<tbody>
			{#each files as file (file.key)}
				<tr>
					<th scope="row" class="truncate">
						<a href={fileHref(handle, file.key)}><FilePath path={file.key} /></a>
					</th>
					<td class="date">{formatMoment(file.modified)}</td>
					<td class="size">{formatSize(file.size)}</td>
				</tr>
			{/each}
		</tbody>
	</LedgerTable>
{/if}

<style>
	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.size {
		width: 1%;
		color: var(--color-muted);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}

	p {
		color: var(--color-muted);
	}
</style>
