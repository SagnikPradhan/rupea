<script lang="ts">
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import type { Snippet } from 'svelte';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';

	type Props = {
		title: string;
		onclose: () => void;
		children: Snippet;
	};

	const { title, onclose, children }: Props = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="modal" role="dialog" aria-label={title}>
	<header>
		<h2>{title}</h2>
		<IconButton label="Close" icon={IconClose} onclick={onclose} />
	</header>

	<div class="body">{@render children()}</div>
</div>

<style>
	.modal {
		position: fixed;
		inset-block-start: var(--size-5);
		inset-inline-end: var(--size-4);
		z-index: 1;
		display: flex;
		flex-direction: column;
		width: min(100vw - var(--size-4) * 2, var(--size-2) * 30);
		max-height: calc(100svh - var(--size-5) - var(--size-3));
		overflow: hidden;
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-2);
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
		padding-top: 0;
	}

	h2 {
		margin: 0;
		font: var(--text-title);
	}
</style>
