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
		place-items: center;
		padding: var(--size-1);
		border-color: transparent;
		background: none;
	}

	button :global(svg) {
		width: var(--size-2);
		height: var(--size-2);
	}

	.outlined {
		border-color: var(--color-border);
		border-radius: var(--radius-1);
		color: var(--color-muted);
	}

	button:hover:not(:disabled) {
		border-color: var(--color-border);
	}
</style>
