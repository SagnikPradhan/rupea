<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		label: string;
		icon: Component<{ size?: number }>;
		/** Extra hover text, such as a shortcut. */
		hint?: string;
	};

	const { label, icon: Icon, hint, ...rest }: Props = $props();
</script>

<button aria-label={label} title={hint ? `${label} (${hint})` : label} {...rest}>
	<Icon size={20} />
</button>

<style>
	button {
		display: grid;
		place-items: center;
		padding: var(--size-1);
		border-color: transparent;
		background: none;
	}

	button:hover:not(:disabled) {
		border-color: var(--color-border);
	}
</style>
