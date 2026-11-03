<script lang="ts">
	import IconCheck from '@tabler/icons-svelte-runes/icons/check';
	import type { Snippet } from 'svelte';

	type Props = {
		href: string;
		/** A chip that is on has an inked outline and a checked box. */
		on?: boolean;
		/** A chip that toggles a filter is a pressed or unpressed button. */
		toggle?: boolean;
		children: Snippet;
	};

	const { href, on = false, toggle = false, children }: Props = $props();
</script>

<a
	class={['chip', { on }]}
	{href}
	role={toggle ? 'button' : undefined}
	aria-pressed={toggle ? on : undefined}
>
	<span class="box" aria-hidden="true"
		>{#if on}<IconCheck size={14} />{/if}</span
	>
	{@render children()}
</a>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--size-1);
		padding: var(--size-1) var(--size-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-ink);
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
		border: 1px solid var(--color-border);
		border-radius: var(--size-0);
	}

	.on .box {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-surface);
	}
</style>
