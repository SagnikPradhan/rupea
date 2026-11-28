<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		primary?: boolean;
		destructive?: boolean;
		href?: ResolvedPathname;
		icon?: Component;
	};

	const {
		primary = false,
		destructive = false,
		href,
		icon: Icon,
		children,
		...rest
	}: Props = $props();
</script>

{#snippet label()}
	{#if Icon}<Icon aria-hidden="true" />{/if}
	{@render children?.()}
{/snippet}

{#if href}
	<a class:primary class:destructive {href}>
		{@render label()}
	</a>
{:else}
	<button class:primary class:destructive {...rest}>
		{@render label()}
	</button>
{/if}

<style>
	a,
	button {
		display: inline-flex;
		align-items: center;
		gap: var(--size-1);
	}

	a {
		padding: var(--size-1) var(--size-2);
		color: var(--color-ink);
		text-decoration: none;
		background: var(--color-surface);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
	}

	a :global(svg),
	button :global(svg) {
		width: var(--size-2);
		height: var(--size-2);
	}

	.destructive {
		color: var(--color-negative);
		background: var(--color-negative-1);
		border-color: var(--color-negative-3);
	}

	.primary {
		color: var(--color-surface);
		background: var(--color-ink);
		border-color: var(--color-ink);
	}
</style>
