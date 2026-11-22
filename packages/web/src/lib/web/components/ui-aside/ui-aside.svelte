<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
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

<svelte:window onkeydown={(e) => e.key === 'Escape' && !e.defaultPrevented && onclose()} />

<aside aria-label={title}>
	<header>
		<h2>{title}</h2>
		<span class={{ close: true, covered: !closeBeside }}>
			<IconButton label="Close" icon={ICONS.close} onclick={onclose} />
		</span>
	</header>

	<div class="body">{@render children()}</div>
</aside>

<style>
	aside {
		position: sticky;
		inset-block-start: var(--size-3);
		display: flex;
		max-height: calc(100svh - var(--size-3) * 2);
		flex-direction: column;
		align-self: start;
		color: var(--color-ink);
		background: var(--color-surface);
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-1);
		overflow: hidden;
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
		padding-block: 0 var(--size-4);
		overflow-y: auto;
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
			z-index: var(--layer-overlay);
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
