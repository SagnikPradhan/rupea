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
		gap: var(--size-1);
		align-items: center;
	}

	a {
		padding: var(--size-1) var(--size-2);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-surface);
		color: var(--color-ink);
		text-decoration: none;
	}

	a :global(svg),
	button :global(svg) {
		width: var(--size-2);
		height: var(--size-2);
	}

	.destructive {
		border-color: var(--color-negative-3);
		background: var(--color-negative-1);
		color: var(--color-negative);
	}

	.primary {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-surface);
	}
</style>
