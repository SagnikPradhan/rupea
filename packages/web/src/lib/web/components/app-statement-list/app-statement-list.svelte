<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { deleteStatements, listImports, listStatements } from '#lib/endpoints/import.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import FilePath from '#lib/web/components/ui-file-path/ui-file-path.svelte';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import { detail } from '#lib/web/shared/errors.ts';
	import { statementHref } from '#lib/web/shared/links.ts';
	import { STATUSES, statusOf } from '#lib/web/shared/statements.ts';

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
		<LedgerTable columns={[{ label: 'Statement' }, { label: 'Status' }, { label: '' }]}>
			<tbody>
				{#each rows as row (row.key)}
					{@const status = STATUSES[row.status]}
					<tr>
						<th scope="row" role="rowheader" class="name">
							<a href={statementHref(handle, row.key)}>
								<FilePath path={row.key} />
							</a>
						</th>
						<td role="cell" class={['status', row.status]}>{status.label}</td>
						<td role="cell" class="actions">
							{#if asking.key === row.key}
								<div class="buttons" role="group" aria-label="Confirm delete">
									<Button primary onclick={() => remove(row.key)}>Delete</Button>
									<Button onclick={() => (asking.key = '')}>Cancel</Button>
								</div>
							{:else}
								<div class="buttons">
									{#if status.action}
										<Button href={statementHref(handle, row.key)}>{status.action}</Button>
									{/if}
									<IconButton
										label="Delete {row.key}"
										icon={ICONS.delete}
										onclick={() => (asking.key = row.key)}
									/>
								</div>
							{/if}
						</td>
					</tr>
					{#if row.job?.error && row.status === 'failed'}
						<tr class="child">
							<td role="cell" colspan="3"><span class="negative">{detail(row.job.error)}</span></td>
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
		gap: var(--size-2);
	}

	.empty {
		color: var(--color-muted);
	}

	section :global(tbody) {
		display: block;
	}

	section :global(thead) {
		position: absolute;
		width: var(--size-line-0);
		height: var(--size-line-0);
		clip-path: inset(50%);
		overflow: hidden;
	}

	tr {
		display: grid;
		padding-block: var(--size-2);
		grid-template-areas:
			'name actions'
			'status .';
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
	}

	section :global(tbody tr) {
		border: 0;
	}

	tr:has(+ .child) {
		padding-bottom: 0;
	}

	tr.child {
		padding-top: 0;
	}

	tr :is(th, td) {
		padding: 0;
	}

	th.name {
		grid-area: name;
		overflow-wrap: anywhere;
	}

	td.status {
		padding-top: var(--size-0);
		grid-area: status;
		color: var(--color-muted);
	}

	td.failed {
		color: var(--color-negative);
	}

	td.actions {
		margin-block: calc(var(--size-1) * -1);
		grid-area: actions;
	}

	tr.child td {
		grid-column: 1 / -1;
	}

	.buttons {
		display: flex;
		justify-content: end;
		gap: var(--size-1);
	}

	.negative {
		color: var(--color-negative);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
