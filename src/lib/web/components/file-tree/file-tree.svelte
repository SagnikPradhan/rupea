<script lang="ts">
	import { page } from '$app/state';
	import { getFiles } from '#lib/endpoints/files.remote.ts';
	import { fileHref } from '#lib/web/links.ts';

	type TreeNode = { label: string; key: string; children: Map<string, TreeNode> };

	const { handle }: { handle: string } = $props();

	const response = $derived(await getFiles(handle));
	const tree = $derived(toTree((response.data ?? []).map((f) => f.key)));
	const selected = $derived(page.url.searchParams.get('file'));

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
	<ul role="list">
		{#each nodes as node (node.label)}
			<li>
				{#if node.children.size === 0}
					<a
						href={fileHref(handle, node.key)}
						aria-current={node.key === selected ? 'page' : undefined}>{node.label}</a
					>
				{:else}
					<details open>
						<summary>{node.label}</summary>
						{@render branch([...node.children.values()])}
					</details>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<nav aria-label="Files">
	{#if tree.length === 0}
		<p>No files yet.</p>
	{/if}
	{@render branch(tree)}
</nav>

<style>
	ul {
		margin: 0;
		padding-left: var(--size-2);
	}

	summary {
		cursor: pointer;
		color: var(--color-muted);
	}

	a {
		color: var(--color-ink);
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	a:hover {
		text-decoration: underline;
	}

	a[aria-current='page'] {
		color: var(--color-accent);
	}

	p {
		margin: 0;
		padding-left: var(--size-2);
		color: var(--color-muted);
	}
</style>
