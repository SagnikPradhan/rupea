<script lang="ts">
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';

	type Props = {
		title: string;
		open: boolean;
		onclose: () => void;
		children: Snippet;
	};

	const { title, open, onclose, children }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={(next) => !next && onclose()}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content aria-describedby={undefined}>
			<header>
				<Dialog.Title>{title}</Dialog.Title>
				<IconButton label="Close" icon={IconClose} onclick={onclose} />
			</header>

			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global([data-dialog-overlay]) {
		position: fixed;
		inset: 0;
		z-index: var(--layer-overlay);
		background: var(--color-scrim);
		backdrop-filter: blur(var(--size-1));
	}

	:global([data-dialog-content]) {
		position: fixed;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		z-index: var(--layer-overlay);
		display: flex;
		width: min(100vw - var(--size-3) * 2, var(--size-2) * 30);
		max-height: calc(100svh - var(--size-3) * 2);
		padding: var(--size-3);
		flex-direction: column;
		gap: var(--size-2);
		color: var(--color-ink);
		background: var(--color-surface);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-2);
		transform: translate(-50%, -50%);
		overflow-y: auto;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-1);
	}

	header :global([data-dialog-title]) {
		margin: 0;
		font: var(--text-title);
	}
</style>
