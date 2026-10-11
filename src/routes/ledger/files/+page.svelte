<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		createFile,
		deleteFile,
		editFile,
		getFiles,
		readFile,
		renameFile,
	} from '#lib/endpoints/files.remote.ts';
	import { checkDraft } from '#lib/endpoints/import.remote.ts';
	import { getEvents, getSuggestions } from '#lib/endpoints/refinement.remote.ts';
	import { createEditor } from '#lib/editor/editor.svelte.ts';
	import FileEditor from '#lib/web/components/file-editor.svelte';
	import FileEvents from '#lib/web/components/file-events.svelte';

	type TreeNode = { label: string; key: string; children: Map<string, TreeNode> };

	// How many possible matches refinement found after the last save, and for which file.
	const matches = $state({ key: '', count: 0 });

	const editor = createEditor(
		{
			read: readFile,
			check: checkDraft,
			save: async (input) => {
				const saved = await editFile(input);
				if (saved.ok) await Promise.all([refine(input.key), getEvents(input.key).refresh()]);
				return saved;
			},
			create: createFile,
			rename: ({ key, to }) => renameFile({ key, to }),
			remove: deleteFile,
		},
		300,
	);

	const response = $derived(await getFiles());
	const tree = $derived(toTree((response.data ?? []).map((f) => f.key)));
	const selected = $derived(page.url.searchParams.get('file'));

	// Untracked: a command updates its own pending state, which would re-run this effect.
	$effect(() => {
		const key = selected;
		untrack(() => void editor.open(key));
	});

	beforeNavigate((navigation) => {
		if (!editor.dirty) return;
		if (navigation.willUnload || !confirm('Discard your unsaved changes?')) navigation.cancel();
	});

	async function refine(key: string) {
		const found = await getSuggestions(key);
		Object.assign(matches, { key, count: found.data?.length ?? 0 });
	}

	const open = (key: string | null) =>
		goto(key === null ? page.url.pathname : `?file=${encodeURIComponent(key)}`);

	async function create() {
		if (editor.dirty && !confirm('Discard your unsaved changes?')) return;
		const key = prompt('New file', 'new.rupee');
		if (key === null) return;
		if (await editor.create(key)) await open(key);
	}

	function toTree(keys: string[]): TreeNode[] {
		const root = new Map<string, TreeNode>();
		for (const key of keys) insert(root, key.split('/').filter(Boolean), key);
		return [...root.values()];
	}

	function insert(nodes: Map<string, TreeNode>, [segment, ...rest]: string[], key: string) {
		if (segment === undefined) return;
		const node = nodes.get(segment) ?? { label: segment, key, children: new Map() };
		nodes.set(segment, node);
		insert(node.children, rest, key);
	}
</script>

{#snippet branch(nodes: TreeNode[])}
	<ul>
		{#each nodes as node (node.label)}
			<li>
				{#if node.children.size === 0}
					<a href="?file={encodeURIComponent(node.key)}">{node.label}</a>
				{:else}
					<span>{node.label}</span>
					{@render branch([...node.children.values()])}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<h1>Files</h1>
<p><a href="/ledger/transactions">Transactions</a> · <button onclick={create}>New file</button></p>

{#each response.errors as error, i (i)}
	<p role="alert">{error.type}</p>
{/each}

<div style="display: flex; gap: 2rem">
	<nav>{@render branch(tree)}</nav>
	<section>
		{#if selected !== null}
			<p>
				<a href="/ledger/refine?file={encodeURIComponent(selected)}">
					{matches.key === selected && matches.count > 0
						? `${matches.count} possible matches: review`
						: 'Find matches'}
				</a>
			</p>
		{/if}
		<FileEditor {editor} onrenamed={open} onremoved={() => open(null)} />
		{#if selected !== null}
			<FileEvents file={selected} locked={editor.dirty} onchanged={editor.reload} />
		{/if}
	</section>
</div>
