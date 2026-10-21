<script lang="ts">
	const { account }: { account: string } = $props();

	const parts = $derived(account.split(':'));
</script>

<span
	><span class="parent"
		>{#each parts.slice(0, -1) as part, i (i)}{part}:<wbr />{/each}</span
	>{parts.at(-1)}</span
>

<style>
	.parent {
		color: var(--color-muted);
	}
</style>
