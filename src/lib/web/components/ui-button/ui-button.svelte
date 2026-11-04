<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & { primary?: boolean; href?: string };

	const { primary = false, href, children, ...rest }: Props = $props();
</script>

{#if href}
	<a class:primary {href}>{@render children?.()}</a>
{:else}
	<button class:primary {...rest}>
		{@render children?.()}
	</button>
{/if}

<style>
	a {
		display: inline-flex;
		padding: var(--size-1) var(--size-2);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-surface);
		color: var(--color-ink);
		text-decoration: none;
	}

	.primary {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-surface);
	}
</style>
