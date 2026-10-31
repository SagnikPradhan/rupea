<script lang="ts">
	import { createEditor } from '#lib/web/components/file-editor/file-editor.svelte.ts';
	import {
		createFile,
		deleteFiles,
		editFile,
		formatFile,
		listFiles,
		parseFile,
		readFile,
		renameFiles,
	} from '#lib/endpoints/files.remote.ts';
	import { listGroups, listSuggestions } from '#lib/endpoints/refinement.remote.ts';
	import FileEditor from '#lib/web/components/file-editor/file-editor.svelte';
	import FileGroups from '#lib/web/components/file-groups/file-groups.svelte';
	import FileIndex from '#lib/web/components/file-index/file-index.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import type { Reply } from '#lib/server/shared/result/reply.ts';
	import { ledgerCrumb } from '#lib/web/shared/links.ts';
	import { beforeNavigate, goto } from '$app/navigation';
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
			check: parseFile,
			format: (content) => formatFile({ content }),
			save: async (input) => {
				const saved = await editFile({ handle, ...input });
				if (saved.ok) void refreshAfterSave(input.key);
				return saved;
			},
			create: (input) => createFile({ handle, ...input }),
			rename: ({ key, to }) => renameFiles({ handle, moves: [{ from: key, to }] }).then(only),
			remove: (key) => deleteFiles({ handle, keys: [key] }).then(only),
		},
		300,
	);

	const response = $derived(await listFiles(handle));
	const selected = $derived(page.url.searchParams.get('file'));
	const line = $derived(Number(page.url.searchParams.get('line')) || null);
	const trail = $derived(
		selected === null
			? [ledgerCrumb(data.ledger)]
			: [ledgerCrumb(data.ledger), { href: page.url.pathname, label: 'Files' }],
	);

	// Untracked: a command updates its own pending state, which would re-run this effect.
	$effect(() => {
		const key = selected;
		untrack(() => void editor.open(key));
	});

	beforeNavigate((navigation) => {
		if (!editor.dirty) return;
		if (navigation.willUnload || !confirm('Discard your unsaved changes?')) navigation.cancel();
	});

	// The save is done whatever these answer, so one that fails leaves what is shown.
	// A slow answer to an older save must not replace the count of a newer one.
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

	const open = (key: string | null) =>
		goto(key === null ? page.url.pathname : `?file=${encodeURIComponent(key)}`);
</script>

<FileEditor {handle} {trail} {editor} {line} onopen={open} onremoved={() => open(null)}>
	{#snippet links()}
		{#if selected !== null}
			<a href="/l/{handle}/refine?file={encodeURIComponent(selected)}">
				{matches.key === selected && matches.count > 0
					? `${matches.count} possible matches: review`
					: 'Find matches'}
			</a>
		{/if}
	{/snippet}
</FileEditor>

<Issues {handle} errors={response.errors} />

{#if selected === null}
	<FileIndex {handle} />
{:else}
	<FileGroups {handle} file={selected} locked={editor.dirty} onchanged={editor.reload} />
{/if}
