<script lang="ts">
	import { deleteFiles, getFiles, renameFiles } from '#lib/endpoints/files.remote.ts';
	import type { RupeeError } from '#lib/server/shared/result/error.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import Field from '#lib/web/components/field/field.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import { formatMoment, formatSize } from '#lib/web/format.ts';
	import { fileHref, isCounted } from '#lib/web/links.ts';
	import IconCollapsed from '@tabler/icons-svelte-runes/icons/chevron-right';
	import IconExpanded from '@tabler/icons-svelte-runes/icons/chevron-down';
	import { SvelteSet } from 'svelte/reactivity';
	import { keysUnder, movedTo, treeRows } from './file-tree';

	type Step = 'choosing' | 'moving' | 'deleting';

	const { handle }: { handle: string } = $props();

	const selected = new SvelteSet<string>();
	const collapsed = new SvelteSet<string>();
	const step = $state({ now: 'choosing' as Step, folder: '', errors: [] as RupeeError[] });
	const last = { key: null as string | null };

	const response = $derived(await getFiles(handle));
	const files = $derived(response.data ?? []);
	const rows = $derived(treeRows(files, [...collapsed]));
	const chosen = $derived(files.map((f) => f.key).filter((k) => selected.has(k)));

	const mark = (keys: string[], on: boolean) =>
		keys.forEach(on ? (k) => selected.add(k) : (k) => selected.delete(k));

	const fold = (folder: string) =>
		collapsed.has(folder) ? collapsed.delete(folder) : collapsed.add(folder);

	/** A file's checkbox marks the files listed since the last one when shift is held. */
	function pick(
		event: MouseEvent & { currentTarget: HTMLInputElement },
		keys: string[],
		file: string | null,
	) {
		mark(
			event.shiftKey && file !== null ? shown(last.key, file) : keys,
			event.currentTarget.checked,
		);
		last.key = file;
	}

	/** The files listed from one key to another, or just the second when the first is hidden. */
	function shown(from: string | null, to: string) {
		const keys = rows.flatMap((r) => (r.file ? [r.path] : []));
		const at = [keys.indexOf(from ?? to), keys.indexOf(to)];
		const start = Math.min(...at);
		return start === -1 ? [to] : keys.slice(start, Math.max(...at) + 1);
	}

	async function move(event: SubmitEvent) {
		event.preventDefault();
		const moves = chosen
			.map((k) => ({ from: k, to: movedTo(k, step.folder) }))
			.filter((m) => m.from !== m.to);
		done((await renameFiles({ handle, moves })).errors);
	}

	async function remove() {
		done((await deleteFiles({ handle, keys: chosen })).errors);
	}

	function done(errors: RupeeError[]) {
		Object.assign(step, { now: 'choosing', errors });
		selected.clear();
	}
</script>

{#snippet checkbox(keys: string[], label: string, file: string | null)}
	{@const all = keys.length > 0 && keys.every((k) => selected.has(k))}
	{@const some = keys.some((k) => selected.has(k))}
	<input
		type="checkbox"
		aria-label={label}
		checked={all}
		{@attach (box) => {
			box.indeterminate = some && !all;
		}}
		onclick={(e) => pick(e, keys, file)}
	/>
{/snippet}

<Issues {handle} errors={step.errors} />

{#if files.length === 0}
	<p class="empty">No files yet.</p>
{:else}
	<div class="toolbar">
		{#if step.now === 'choosing'}
			<label>
				{@render checkbox(
					files.map((f) => f.key),
					'Select all files',
					null,
				)}
				{chosen.length === 0 ? 'Select all' : `${chosen.length} selected`}
			</label>
			{#if chosen.length > 0}
				<Button onclick={() => (step.now = 'moving')}>Move</Button>
				<Button onclick={() => (step.now = 'deleting')}>Delete</Button>
			{/if}
		{/if}

		{#if step.now === 'moving'}
			<form class="toolbar" onsubmit={move}>
				<Field label={`Move ${chosen.length} files to folder`}>
					<input bind:value={step.folder} placeholder="bank/2026" />
				</Field>
				<Button primary>Move</Button>
				<Button type="button" onclick={() => (step.now = 'choosing')}>Cancel</Button>
			</form>
		{/if}

		{#if step.now === 'deleting'}
			<div class="toolbar" role="group" aria-label="Confirm delete">
				<p>Delete {chosen.length} files?</p>
				<Button primary onclick={remove}>Delete</Button>
				<Button onclick={() => (step.now = 'choosing')}>Cancel</Button>
			</div>
		{/if}
	</div>

	<LedgerTable
		columns={[
			{ label: 'File' },
			{ label: 'Modified', kind: 'date' },
			{ label: 'Size', kind: 'amount' },
		]}
	>
		<tbody>
			{#each rows as row (row.path)}
				<tr>
					<th scope="row" class="truncate">
						<span class="entry" style:--depth={row.depth}>
							{#if row.file}
								{@render checkbox([row.path], `Select ${row.path}`, row.path)}
								<a href={fileHref(handle, row.path)} class="plain">{row.name}</a>
							{:else}
								{@const Chevron = collapsed.has(row.path) ? IconCollapsed : IconExpanded}
								{@render checkbox(keysUnder(files, row.path), `Select ${row.path}`, null)}
								<button
									class="folder"
									aria-expanded={!collapsed.has(row.path)}
									onclick={() => fold(row.path)}
								>
									<Chevron size={16} />
									{row.name}/
								</button>
							{/if}
							{#if row.depth === 0 && !isCounted(row.path)}<span class="tag">not counted</span>{/if}
						</span>
					</th>
					<td class="date">{row.file ? formatMoment(row.file.modified) : ''}</td>
					<td class="amount size">{row.file ? formatSize(row.file.size) : ''}</td>
				</tr>
			{/each}
		</tbody>
	</LedgerTable>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		align-items: end;
		min-height: var(--size-5);
	}

	form.toolbar > :global(:first-child) {
		flex: 1;
	}

	form.toolbar input {
		width: 100%;
	}

	label,
	.entry {
		display: flex;
		gap: var(--size-1);
		align-items: center;
	}

	label {
		align-self: center;
		margin-right: auto;
	}

	p {
		align-self: center;
		margin: 0;
	}

	.entry {
		margin-left: calc(var(--size-3) * var(--depth));
	}

	.folder {
		display: flex;
		gap: var(--size-0);
		align-items: center;
		padding: 0;
		border: none;
		background: none;
		color: var(--color-muted);
		font-weight: inherit;
	}

	.size,
	.empty {
		color: var(--color-muted);
	}
</style>
