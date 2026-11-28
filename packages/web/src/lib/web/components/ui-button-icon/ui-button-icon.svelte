<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		label: string;
		icon: Component;
		hint?: string;
		outlined?: boolean;
	};

	const { label, icon: Icon, hint, outlined = false, ...rest }: Props = $props();
</script>

<button
	class={{ outlined }}
	aria-label={label}
	title={hint ? `${label} (${hint})` : label}
	{...rest}
>
	<Icon />
</button>

<style>
	button {
		display: grid;
		padding: var(--size-1);
		place-items: center;
		background: none;
		border-color: transparent;
	}

	button :global(svg) {
		width: var(--size-2);
		height: var(--size-2);
	}

	.outlined {
		color: var(--color-muted);
		border-color: var(--color-border);
		border-radius: var(--radius-1);
	}

	button:hover:not(:disabled) {
		border-color: var(--color-border);
	}
</style>
