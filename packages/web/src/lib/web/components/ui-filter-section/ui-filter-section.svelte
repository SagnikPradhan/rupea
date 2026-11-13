<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		id?: string;
		children: Snippet;
	};

	const { label, id, children }: Props = $props();
</script>

<div>
	<span {id}>{label}</span>
	{@render children()}
</div>

<style>
	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	span {
		color: var(--color-muted);
	}
</style>
