<script lang="ts">
	const { path }: { path: string } = $props();

	const folder = $derived(path.slice(0, path.lastIndexOf('/') + 1));
</script>

<span><span class="folder">{folder}</span>{path.slice(folder.length)}</span>

<style>
	.folder {
		color: var(--color-muted);
	}
</style>
