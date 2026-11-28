<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';

	type Props = {
		/** A chip without a link is a button that calls onclick. */
		href?: ResolvedPathname;
		onclick?: () => void;
		on?: boolean;
		toggle?: boolean;
		/** Drops the padding and border, leaving the box and label. */
		bare?: boolean;
		children: Snippet;
	};

	const { href, onclick, on = false, toggle = false, bare = false, children }: Props = $props();
</script>

<svelte:element
	this={href === undefined ? 'button' : 'a'}
	class={['chip', { on, bare }]}
	{href}
	{onclick}
	type={href === undefined ? 'button' : undefined}
	role={toggle && href !== undefined ? 'button' : undefined}
	aria-pressed={toggle || href === undefined ? on : undefined}
>
	<span class="box" aria-hidden="true">
		{#if on}<ICONS.check size={14} />{/if}
	</span>
	{@render children()}
</svelte:element>

<style>
	.chip {
		display: inline-flex;
		padding: var(--size-1) var(--size-2);
		align-items: center;
		gap: var(--size-1);
		color: var(--color-ink);
		font: inherit;
		text-decoration: none;
		background: var(--color-surface);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
	}

	.chip:hover {
		text-decoration: none;
	}

	.bare {
		padding: 0;
		background: none;
		border: 0;
	}

	.on {
		border-color: var(--color-ink);
	}

	.box {
		display: grid;
		width: var(--size-2);
		height: var(--size-2);
		flex-shrink: 0;
		place-items: center;
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--size-0);
	}

	.on .box {
		color: var(--color-surface);
		background: var(--color-ink);
		border-color: var(--color-ink);
	}
</style>
