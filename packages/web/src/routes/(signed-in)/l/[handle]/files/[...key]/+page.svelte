<script lang="ts">
	import { createEditor } from '#lib/web/components/app-file-editor/app-file-editor.svelte.ts';
	import {
		createFile,
		deleteFiles,
		editFile,
		findTransaction,
		formatFile,
		listFiles,
		parseFile,
		readFile,
		renameFiles,
	} from '#lib/endpoints/files.remote.ts';
	import { listGroups, listSuggestions } from '#lib/endpoints/refinement.remote.ts';
	import FileEditor from '#lib/web/components/app-file-editor/app-file-editor.svelte';
	import FileTransactionAside from '#lib/web/components/app-file-transaction-aside/app-file-transaction-aside.svelte';
	import FileTransactions from '#lib/web/components/app-file-transactions/app-file-transactions.svelte';
	import FileMatches from '#lib/web/components/app-file-matches/app-file-matches.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import type { Reply } from '@rupea/shared/errors.ts';
	import { beforeNavigate, goto } from '$app/navigation';
	import { fileHref, hrefWith } from '#lib/web/shared/links.ts';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';

	const { data } = $props();

	// The editor is made once; the layout remounts the page for another ledger.
	const handle = untrack(() => data.ledger.handle);

	// How many possible matches refinement found after the last save, and for which file.
	const matches = $state({ key: '', count: 0 });
	const saves = { count: 0 };

	// The editor changes one file at a time; it failed when that one is not among those done.
	const only = <T,>(r: Reply<T[]>): Reply<T> => ({ ...r, data: r.data?.[0] ?? null });

	const editor = createEditor(
		{
			read: (key) => readFile({ handle, key }),
			check: (input) => parseFile({ handle, ...input }),
			format: (content) => formatFile({ handle, content }),
			save: async (input) => {
				const saved = await editFile({ handle, ...input });
				if (saved.ok) afterSave(input.key);
				return saved;
			},
			create: (input) => createFile({ handle, ...input }),
			rename: ({ key, to }) => renameFiles({ handle, moves: [{ from: key, to }] }).then(only),
			remove: (key) => deleteFiles({ handle, keys: [key] }).then(only),
		},
		300,
	);

	const response = $derived(await listFiles(handle));
	const selected = $derived(page.params.key ?? '');
	const line = $derived(Number(page.url.searchParams.get('line')) || null);
	const ui = $derived(page.url.searchParams.get('view') === 'ui');
	const at = $derived(Number(page.url.searchParams.get('edit')) || null);
	const editing = $derived(ui ? selected : null);
	const view = $derived({
		chosen: ui ? ('ui' as const) : ('file' as const),
		segments: [
			{
				name: 'Text',
				chosen: !ui,
				href: hrefWith(page.url.searchParams, { view: 'text', edit: '' }),
			},
			{
				name: 'Transactions',
				chosen: ui,
				href: hrefWith(page.url.searchParams, { view: 'ui', line: '' }),
			},
		],
	});

	// Untracked: a command updates its own pending state, which would re-run this effect.
	$effect(() => {
		const key = selected;
		untrack(() => void editor.open(key));
	});

	// Opening or closing a transaction leaves the file in the editor as it is.
	beforeNavigate((navigation) => {
		if (!editor.dirty) return;
		if (navigation.to?.url.pathname === page.url.pathname) return;
		if (navigation.willUnload || !confirm('Discard your unsaved changes?')) navigation.cancel();
	});

	// The save is done whatever these answer, so one that fails leaves what is shown.
	// A slow answer to an older save must not replace the count of a newer one.
	function afterSave(key: string) {
		void refreshAfterSave(key);
	}

	async function refreshAfterSave(key: string) {
		saves.count += 1;
		const save = saves.count;
		const [found] = await Promise.allSettled([
			listSuggestions({ handle, file: key }),
			listGroups({ handle, file: key }).refresh(),
		]);

		if (save === saves.count && found.status === 'fulfilled')
			Object.assign(matches, { key, count: found.value.data?.length ?? 0 });
	}

	const open = (file: string | null) =>
		goto(
			file === null ? resolve('/(signed-in)/l/[handle]/files', { handle }) : fileHref(handle, file),
		);

	async function transactionSaved(moved?: number) {
		if (!editor.dirty) await editor.reload();
		void refreshAfterSave(selected);
		if (moved !== undefined)
			await findTransaction({ handle, file: selected, line: moved }).refresh();

		await goto(
			hrefWith(page.url.searchParams, { edit: moved === undefined ? '' : String(moved) }),
			{
				reset: false,
			},
		);
	}

	const found = $derived({
		count: matches.key === selected ? matches.count : 0,
		locked: editor.dirty,
		onchanged: editor.reload,
	});
</script>

<PanelGrid wide>
	<div class={{ main: true, docked: editing !== null && at !== null }}>
		<FileEditor {handle} {editor} {line} {view} onopen={open} onremoved={() => open(null)}>
			{#snippet ui()}
				{#if editor.state.file}
					<FileTransactions
						{handle}
						file={editor.state.file.key}
						content={editor.state.file.content}
						{at}
						unsaved={editor.dirty}
					/>
				{/if}
			{/snippet}
		</FileEditor>

		<Issues {handle} errors={response.errors} />
	</div>

	<div class="side">
		{#if editing !== null && at !== null}
			<FileTransactionAside
				{handle}
				file={editing}
				line={at}
				onsaved={transactionSaved}
				onclose={() => goto(hrefWith(page.url.searchParams, { edit: '' }), { reset: false })}
			/>
		{/if}
		{#if at === null}
			<FileMatches {handle} file={selected} {...found} />
		{/if}
	</div>
</PanelGrid>

<style>
	.main {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: var(--size-3);
	}

	.side {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: var(--size-3);
	}

	.side > :global(*) {
		align-self: stretch;
	}

	@media (width >= 90rem) {
		.side {
			align-self: stretch;
		}
	}

	.main > :global(*) {
		margin-block: 0;
	}

	@media (48rem <= width < 90rem) {
		.docked {
			padding-inline-end: calc(min(100vw - var(--size-4) * 2, var(--size-2) * 30) + var(--size-3));
		}
	}
</style>
