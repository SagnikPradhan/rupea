<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		label: string;
		icon: Component<{ size?: number }>;
		/** Extra hover text, such as a shortcut. */
		hint?: string;
		/** Draws the square outline the theme toggle has. */
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
	<Icon size={outlined ? 18 : 20} />
</button>

<style>
	button {
		display: grid;
		place-items: center;
		padding: var(--size-1);
		border-color: transparent;
		background: none;
	}

	.outlined {
		border-color: var(--color-border);
		border-radius: var(--radius);
		color: var(--color-muted);
	}

	button:hover:not(:disabled) {
		border-color: var(--color-border);
	}
</style>
