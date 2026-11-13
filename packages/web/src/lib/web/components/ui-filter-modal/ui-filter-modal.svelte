<script lang="ts">
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		params: string[];
		children: Snippet;
	};

	const { params, children }: Props = $props();

	const reset = $derived(
		hrefWith(page.url.searchParams, Object.fromEntries(params.map((key) => [key, '']))),
	);
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}<Button {...props}>Filter</Button>{/snippet}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content align="end" sideOffset={8} collisionPadding={8}>
			{#snippet child({ props, wrapperProps })}
				<div {...wrapperProps}>
					<div {...props} class="panel" role="dialog" aria-label="Filter">
						<header>
							<h2>Filter</h2>
							<Popover.Close>
								{#snippet child({ props })}
									<IconButton {...props} label="Close" icon={IconClose} />
								{/snippet}
							</Popover.Close>
						</header>

						{@render children()}

						<footer>
							<Button href={reset}>Reset</Button>
							<Popover.Close>
								{#snippet child({ props })}<Button {...props} primary>Apply</Button>{/snippet}
							</Popover.Close>
						</footer>
					</div>
				</div>
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	header,
	footer {
		display: flex;
		align-items: center;
		gap: var(--size-1);
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		width: min(100vw - var(--size-3) * 2, var(--size-2) * 24);
		min-height: min(100svh - var(--size-3) * 2, var(--size-2) * 27);
		max-height: var(--bits-popover-content-available-height);
		overflow-y: auto;
		padding: var(--size-2);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-surface);
		color: var(--color-ink);
	}

	header {
		justify-content: space-between;
	}

	footer {
		margin-top: auto;
	}

	footer :global(.primary) {
		flex: 1;
	}
</style>
