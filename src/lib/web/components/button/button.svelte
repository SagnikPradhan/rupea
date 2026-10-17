<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & { primary?: boolean; icon?: Component<{ size?: number }> };

	const { primary = false, icon: Icon, children, ...rest }: Props = $props();
</script>

<button class:primary {...rest}>
	{#if Icon}<Icon size={20} />{/if}
	{@render children?.()}
</button>

<style>
	button {
		display: inline-flex;
		gap: var(--size-1);
		align-items: center;
	}

	.primary {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-surface);
	}
</style>
