<script lang="ts">
	import { getFiles } from '#lib/endpoints/files.remote.ts';

	type TreeNode = { label: string; children: Map<string, TreeNode> };

	const response = $derived(await getFiles());
	const tree = $derived(toTree((response.data ?? []).map((f) => f.key)));

	function toTree(keys: string[]): TreeNode[] {
		const root = new Map<string, TreeNode>();
		for (const key of keys) insert(root, key.split('/').filter(Boolean));
		return [...root.values()];
	}

	function insert(nodes: Map<string, TreeNode>, [segment, ...rest]: string[]) {
		if (segment === undefined) return;
		const node = nodes.get(segment) ?? { label: segment, children: new Map() };
		nodes.set(segment, node);
		insert(node.children, rest);
	}
</script>

{#snippet branch(nodes: TreeNode[])}
	<ul>
		{#each nodes as node (node.label)}
			<li>
				<span>{node.label}</span>
				{#if node.children.size > 0}
					{@render branch([...node.children.values()])}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<h1>Files</h1>

{#each response.errors as error, i (i)}
	<p role="alert">{error.type}</p>
{/each}

{@render branch(tree)}
