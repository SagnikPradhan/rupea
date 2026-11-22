<script lang="ts">
	type Props = { path: string };

	const { path }: Props = $props();

	const folder = $derived(path.slice(0, path.lastIndexOf('/') + 1));
</script>

<span>
	<span class="folder">{folder}</span><span class="name">{path.slice(folder.length)}</span>
</span>

<style>
	.folder {
		color: var(--color-muted);
	}

	.name {
		color: var(--color-ink);
	}
</style>
