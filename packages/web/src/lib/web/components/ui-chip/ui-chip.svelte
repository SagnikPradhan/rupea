<script lang="ts">
	import IconCheck from '@tabler/icons-svelte-runes/icons/check';
	import type { Snippet } from 'svelte';

	type Props = {
		/** A chip without a link is a button that calls onclick. */
		href?: string;
		onclick?: () => void;
		on?: boolean;
		toggle?: boolean;
		children: Snippet;
	};

	const { href, onclick, on = false, toggle = false, children }: Props = $props();
</script>

<svelte:element
	this={href === undefined ? 'button' : 'a'}
	class={['chip', { on }]}
	{href}
	{onclick}
	type={href === undefined ? 'button' : undefined}
	role={toggle && href !== undefined ? 'button' : undefined}
	aria-pressed={toggle || href === undefined ? on : undefined}
>
	<span class="box" aria-hidden="true"
		>{#if on}<IconCheck size={14} />{/if}</span
	>
	{@render children()}
</svelte:element>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--size-1);
		padding: var(--size-1) var(--size-2);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-surface);
		color: var(--color-ink);
		font: inherit;
		text-decoration: none;
	}

	.chip:hover {
		text-decoration: none;
	}

	.on {
		border-color: var(--color-ink);
	}

	.box {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: var(--size-2);
		height: var(--size-2);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--size-0);
	}

	.on .box {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-surface);
	}
</style>
