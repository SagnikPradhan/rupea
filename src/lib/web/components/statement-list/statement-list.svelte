<script lang="ts">
	import { deleteStatements, listImports, listStatements } from '#lib/endpoints/import.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import FilePath from '#lib/web/components/file-path/file-path.svelte';
	import IconButton from '#lib/web/components/icon-button/icon-button.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import { detail } from '#lib/web/shared/errors.ts';
	import { STATUS_LABELS, statusOf } from '#lib/web/shared/statements.ts';
	import IconDelete from '@tabler/icons-svelte-runes/icons/trash';

	const { handle }: { handle: string } = $props();

	const uploaded = $derived(await listStatements(handle));
	const imports = $derived(await listImports(handle));
	const rows = $derived(
		(uploaded.data ?? []).map((s) => {
			const job = (imports.data ?? []).find((j) => j.statement === s.key);
			return { ...s, job, status: statusOf(s, job) };
		}),
	);

	const asking = $state({ key: '', errors: [] as RupeaError[] });

	async function remove(key: string) {
		const deleted = await deleteStatements({ handle, keys: [key] });
		Object.assign(asking, { key: '', errors: deleted.errors });
	}
</script>

<section>
	<Issues {handle} errors={[...uploaded.errors, ...imports.errors, ...asking.errors]} />

	{#if rows.length === 0}
		<p class="empty">
			Upload a bank or card statement (.csv, .xls, .xlsx or .pdf), or a ledger file, to add its
			transactions to this ledger.
		</p>
	{:else}
		<LedgerTable
			columns={[{ label: 'Statement' }, { label: 'Status', kind: 'date' }, { label: '' }]}
		>
			<tbody>
				{#each rows as row (row.key)}
					<tr>
						<th scope="row" class="truncate">
							<a class="plain" href="?statement={encodeURIComponent(row.key)}">
								<FilePath path={row.key} />
							</a>
						</th>
						<td class={['date', row.status]}>{STATUS_LABELS[row.status]}</td>
						<td class="actions">
							{#if asking.key === row.key}
								<div class="confirm" role="group" aria-label="Confirm delete">
									<Button primary onclick={() => remove(row.key)}>Delete</Button>
									<Button onclick={() => (asking.key = '')}>Cancel</Button>
								</div>
							{:else}
								<IconButton
									label="Delete {row.key}"
									icon={IconDelete}
									onclick={() => (asking.key = row.key)}
								/>
							{/if}
						</td>
					</tr>
					{#if row.job?.error && row.status === 'failed'}
						<tr class="child">
							<td colspan="3"><span class="negative">{detail(row.job.error)}</span></td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</LedgerTable>
	{/if}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: var(--gap-related);
	}

	.empty {
		margin: 0;
		color: var(--color-muted);
	}

	td.ready,
	td.setup {
		color: var(--color-accent);
	}

	td.failed {
		color: var(--color-negative);
	}

	.actions {
		width: 1%;
		white-space: nowrap;
		vertical-align: middle;
	}

	.confirm {
		display: flex;
		gap: var(--gap-label);
		justify-content: end;
	}
</style>
