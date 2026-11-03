<script lang="ts">
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import type { Snippet } from 'svelte';
	import Button from '#lib/web/components/button/button.svelte';
	import IconButton from '#lib/web/components/icon-button/icon-button.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		/** The query parameters the filters keep, which Reset clears. */
		params: string[];
		children: Snippet;
	};

	const { params, children }: Props = $props();

	const reset = $derived(
		hrefWith(page.url.searchParams, Object.fromEntries(params.map((key) => [key, '']))),
	);
</script>

<Button popovertarget="filter" style="anchor-name: --filter">Filter</Button>

<div id="filter" popover aria-label="Filter">
	<header>
		<h2>Filter</h2>
		<IconButton label="Close" icon={IconClose} popovertarget="filter" popovertargetaction="hide" />
	</header>

	{@render children()}

	<footer>
		<a class="button" href={reset}>Reset</a>
		<Button primary popovertarget="filter" popovertargetaction="hide">Apply</Button>
	</footer>
</div>

<style>
	[popover] {
		display: none;
		flex-direction: column;
		gap: var(--size-2);
		width: min(100% - var(--size-3) * 2, var(--size-2) * 24);
		min-height: min(100% - var(--size-3) * 2, var(--size-2) * 27);
		max-height: 100%;
		overflow-y: auto;
		padding: var(--size-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-large);
		background: var(--color-surface);
		color: var(--color-ink);
	}

	[popover]:popover-open {
		display: flex;
	}

	@supports (position-anchor: --filter) {
		[popover] {
			position-anchor: --filter;
			inset: auto;
			top: anchor(bottom);
			right: anchor(right);
			position-try-fallbacks: flip-inline;
			margin: var(--size-1) 0 0;
		}
	}

	header,
	footer {
		display: flex;
		align-items: center;
		gap: var(--size-1);
	}

	header {
		justify-content: space-between;
	}

	h2 {
		margin: 0;
	}

	footer {
		margin-top: auto;
	}

	footer a {
		text-decoration: none;
	}

	footer :global(.primary) {
		flex: 1;
	}
</style>
