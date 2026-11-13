<script lang="ts">
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import type { Snippet } from 'svelte';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';

	type Props = {
		title: string;
		onclose: () => void;
		/**
		 * False when the page already has the way to close it in view while the
		 * aside sits beside it.
		 */
		closeBeside?: boolean;
		children: Snippet;
	};

	const { title, onclose, closeBeside = true, children }: Props = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<aside aria-label={title}>
	<header>
		<h2>{title}</h2>
		<span class={{ close: true, covered: !closeBeside }}>
			<IconButton label="Close" icon={IconClose} onclick={onclose} />
		</span>
	</header>

	<div class="body">{@render children()}</div>
</aside>

<style>
	aside {
		position: sticky;
		inset-block-start: var(--size-3);
		display: flex;
		flex-direction: column;
		align-self: start;
		max-height: calc(100svh - var(--size-3) * 2);
		overflow: hidden;
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-1);
		background: var(--color-surface);
		color: var(--color-ink);
	}

	header,
	.body {
		padding: var(--size-3);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-1);
	}

	.body {
		overflow-y: auto;
		padding-block: 0 var(--size-4);
	}

	h2 {
		margin: 0;
		font: var(--text-title);
	}

	@media (width >= 90rem) {
		.covered {
			display: none;
		}
	}

	@media (width < 90rem) {
		aside {
			position: fixed;
			inset-block-start: var(--size-5);
			inset-inline-end: var(--size-4);
			z-index: 1;
			width: min(100vw - var(--size-4) * 2, var(--size-2) * 30);
			max-height: calc(100svh - var(--size-5) - var(--size-3));
			border-color: var(--color-border);
			border-radius: var(--radius-2);
		}
	}

	@media (width < 48rem) {
		aside {
			inset: 0;
			width: auto;
			max-height: none;
			border: none;
			border-radius: 0;
		}
	}
</style>
