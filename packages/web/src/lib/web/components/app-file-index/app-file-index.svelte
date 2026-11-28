<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { deleteFiles, listFiles, renameFiles } from '#lib/endpoints/files.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import { isCounted } from '@rupea/shared/files.ts';
	import { fileHref } from '#lib/web/shared/links.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { countLabel, foldersOf, isOpen, keysUnder, movedTo, treeRows } from './file-tree';

	const formats = formatsHere();

	type Step = 'choosing' | 'moving' | 'deleting';

	const { handle }: { handle: string } = $props();

	const selected = new SvelteSet<string>();
	const toggled = new SvelteSet<string>();
	const step = $state({ now: 'choosing' as Step, folder: '', errors: [] as RupeaError[] });
	const last = { key: null as string | null };

	const response = $derived(await listFiles(handle));
	const counted = $derived((response.data ?? []).filter((f) => isCounted(f.key)));
	const rows = $derived(treeRows(counted, [...toggled]));
	const chosen = $derived(counted.map((f) => f.key).filter((k) => selected.has(k)));

	const mark = (keys: string[], on: boolean) =>
		keys.forEach(on ? (k) => selected.add(k) : (k) => selected.delete(k));

	function toggle(folder: string) {
		last.key = null;
		if (!toggled.delete(folder)) toggled.add(folder);
	}

	const reveal = (folder: string) => {
		if (!isOpen(folder, [...toggled])) toggle(folder);
	};

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

	function shown(from: string | null, to: string) {
		const keys = rows.flatMap((r) => (r.file ? [r.file.key] : []));
		const anchor = keys.indexOf(from ?? '');
		const end = keys.indexOf(to);
		if (anchor === -1) return [to];

		return keys.slice(Math.min(anchor, end), Math.max(anchor, end) + 1);
	}

	function move(event: SubmitEvent) {
		event.preventDefault();
		const moves = chosen
			.map((k) => ({ from: k, to: movedTo(k, step.folder) }))
			.filter((m) => m.from !== m.to);
		return renameFiles({ handle, moves }).then((r) => {
			if (r.errors.length === 0) moves.flatMap((m) => foldersOf(m.to)).forEach(reveal);
			done(r.errors);
		});
	}

	function remove() {
		return deleteFiles({ handle, keys: chosen }).then((r) => done(r.errors));
	}

	function done(errors: RupeaError[]) {
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

<section>
	<Issues {handle} errors={step.errors} />

	{#if rows.length === 0}
		<p class="empty">No files yet.</p>
	{:else}
		<div class="toolbar">
			{#if step.now === 'choosing'}
				<label class="grow">
					{@render checkbox(
						counted.map((f) => f.key),
						'Select all files',
						null,
					)}
					Select all
				</label>
				{#if chosen.length > 0}
					<span class="count">{countLabel(chosen.length)} selected</span>
				{/if}
				<Button disabled={chosen.length === 0} onclick={() => (step.now = 'moving')}>Move</Button>
				<Button
					icon={ICONS.delete}
					disabled={chosen.length === 0}
					onclick={() => (step.now = 'deleting')}
				>
					Delete
				</Button>
			{/if}

			{#if step.now === 'moving'}
				<form class="toolbar grow" onsubmit={move}>
					<label class="grow">
						Move {countLabel(chosen.length)} to
						<input class="grow" bind:value={step.folder} placeholder="bank/2026" />
					</label>
					<Button primary>Move</Button>
					<Button type="button" onclick={() => (step.now = 'choosing')}>Cancel</Button>
				</form>
			{/if}

			{#if step.now === 'deleting'}
				<div class="toolbar grow" role="group" aria-label="Confirm delete">
					<p class="grow">Delete {countLabel(chosen.length)}?</p>
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
									{@render checkbox([row.file.key], `Select ${row.path}`, row.file.key)}
									<a href={fileHref(handle, row.path)}>{row.name}</a>
								{:else}
									{@const keys = keysUnder(counted, row.path)}
									{@const open = isOpen(row.path, [...toggled])}
									{@const Chevron = open ? ICONS.expanded : ICONS.collapsed}
									{@render checkbox(keys, `Select ${row.path}`, null)}
									<button class="folder" aria-expanded={open} onclick={() => toggle(row.path)}>
										<Chevron size={16} />
										{row.name}/
									</button>
									<span class="count">{countLabel(keys.length)}</span>
								{/if}
							</span>
						</th>
						<td class="date">
							{row.file?.modified ? formats.moment(new Date(row.file.modified)) : ''}
						</td>
						<td class="amount size">{row.file?.size == null ? '' : formats.size(row.file.size)}</td>
					</tr>
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

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-1);
	}

	label,
	.entry {
		display: flex;
		align-items: center;
		gap: var(--size-1);
	}

	.grow {
		flex: 1;
	}

	label {
		margin-right: auto;
		align-self: center;
		white-space: nowrap;
	}

	input.grow {
		min-width: 0;
	}

	p {
		align-self: center;
	}

	.entry {
		margin-left: calc(var(--size-3) * var(--depth));
	}

	.folder {
		display: flex;
		padding: 0;
		align-items: center;
		gap: var(--size-0);
		color: var(--color-muted);
		font-weight: inherit;
		background: none;
		border: none;
	}

	.size,
	.count,
	.empty {
		color: var(--color-muted);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
