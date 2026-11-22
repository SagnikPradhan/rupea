<script lang="ts">
	import { createEditor } from '#lib/web/components/app-file-editor/app-file-editor.svelte.ts';
	import {
		createFile,
		deleteFiles,
		editFile,
		findTransactionAt,
		formatFile,
		listFiles,
		parseFile,
		readFile,
		renameFiles,
	} from '#lib/endpoints/files.remote.ts';
	import { listStatements } from '#lib/endpoints/import.remote.ts';
	import { listGroups, listSuggestions } from '#lib/endpoints/refinement.remote.ts';
	import FileEditor from '#lib/web/components/app-file-editor/app-file-editor.svelte';
	import FileTransactionAside from '#lib/web/components/app-file-transaction-aside/app-file-transaction-aside.svelte';
	import FileTransactions from '#lib/web/components/app-file-transactions/app-file-transactions.svelte';
	import FileMatches from '#lib/web/components/app-file-matches/app-file-matches.svelte';
	import ImportPanel from '#lib/web/components/app-import-panel/app-import-panel.svelte';
	import StatementView from '#lib/web/components/app-statement-view/app-statement-view.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import FilePath from '#lib/web/components/ui-file-path/ui-file-path.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import { isCounted, REVIEW } from '@rupea/shared/files.ts';
	import type { Reply } from '@rupea/shared/errors.ts';
	import { beforeNavigate, goto } from '$app/navigation';
	import { fileHref, hrefWith, statementHref } from '#lib/web/shared/links.ts';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack, type Snippet } from 'svelte';

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
	const key = $derived(page.params.key ?? '');
	const stored = $derived(
		!isCounted(key) && !key.endsWith('.rupea') ? key.slice(REVIEW.length + 1) : null,
	);
	const selected = $derived(stored === null ? key : null);
	const line = $derived(Number(page.url.searchParams.get('line')) || null);
	const statements = $derived(await listStatements(handle));
	const statement = $derived(
		stored ??
			(selected !== null && !isCounted(selected)
				? (statements.data ?? []).find((s) => s.file === selected)?.key
				: null) ??
			null,
	);
	const draftKey = $derived((statements.data ?? []).find((s) => s.key === statement)?.file ?? null);
	const draft = $derived(draftKey !== null && !isCounted(draftKey) ? draftKey : null);
	const target = $derived(selected ?? draft);
	const revision = $state({ count: 0 });
	const ui = $derived(
		page.url.searchParams.get('view') === 'ui' ||
			(draft !== null && page.url.searchParams.get('view') === null),
	);
	const at = $derived(Number(page.url.searchParams.get('edit')) || null);
	const editing = $derived(ui ? target : null);
	const original = $derived(draft !== null && page.url.searchParams.get('view') === 'statement');
	const view = $derived({
		chosen: original ? ('statement' as const) : ui ? ('ui' as const) : ('file' as const),
		segments: [
			{
				name: 'Text',
				chosen: !ui && !original,
				href: hrefWith(page.url.searchParams, { view: 'text', edit: '' }),
			},
			{
				name: 'Transactions',
				chosen: ui,
				href: hrefWith(page.url.searchParams, { view: 'ui', line: '' }),
			},
			...(draft === null
				? []
				: [
						{
							name: 'Statement',
							chosen: original,
							href: hrefWith(page.url.searchParams, { view: 'statement', edit: '', line: '' }),
						},
					]),
		],
	});

	// Untracked: a command updates its own pending state, which would re-run this effect.
	$effect(() => {
		const key = target;
		untrack(() => void editor.open(key));
	});

	// Opening or closing the import modal leaves the file in the editor as it is.
	beforeNavigate((navigation) => {
		if (!editor.dirty) return;
		if (navigation.to?.url.pathname === page.url.pathname) return;
		if (navigation.willUnload || !confirm('Discard your unsaved changes?')) navigation.cancel();
	});

	// The save is done whatever these answer, so one that fails leaves what is shown.
	// A slow answer to an older save must not replace the count of a newer one.
	function afterSave(key: string) {
		revision.count++;
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
		revision.count++;
		if (target !== null) await editor.reload();
		if (target !== null) void refreshAfterSave(target);
		if (target !== null && moved !== undefined)
			await findTransactionAt({ handle, file: target, line: moved }).refresh();

		await goto(
			hrefWith(page.url.searchParams, { edit: moved === undefined ? '' : String(moved) }),
			{
				reset: false,
			},
		);
	}

	async function removed() {
		await listStatements(handle).refresh();
		if (selected !== null) await open(null);
	}

	const found = $derived({
		count: matches.key === target ? matches.count : 0,
		locked: editor.dirty,
		onchanged: editor.reload,
	});

	function uploaded(keys: string[]) {
		const first = keys[0];
		if (first !== undefined) void goto(statementHref(handle, first));
	}
</script>

{#snippet fileEditor(next?: Snippet, below?: Snippet, sheet?: Snippet)}
	<FileEditor
		{handle}
		{editor}
		{line}
		{view}
		{next}
		{below}
		original={sheet}
		renamable={draft === null}
		onopen={open}
		onremoved={removed}
	>
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
{/snippet}

<PanelGrid wide>
	<div class={{ main: true, docked: editing !== null && at !== null }}>
		{#if statement === null}
			{@render fileEditor()}
		{/if}
		{#if statement !== null && draft === null}
			<PageHeader>
				Files
				{#snippet subtitle()}
					<FilePath path={statement} />
				{/snippet}
			</PageHeader>
		{/if}
		{#if statement !== null}
			{#key statement}
				<StatementView {handle} {statement} revision={revision.count} dirty={editor.dirty}>
					{#snippet filed(next: Snippet, below: Snippet, sheet: Snippet)}
						{@render fileEditor(next, below, sheet)}
					{/snippet}
				</StatementView>
			{/key}
		{/if}

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
		{:else}
			<ImportPanel {handle} onuploaded={uploaded} />

			{#if target !== null}
				<FileMatches {handle} file={target} {...found} />
			{/if}
		{/if}
	</div>
</PanelGrid>

<style>
	.main {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		min-width: 0;
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		min-width: 0;
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
