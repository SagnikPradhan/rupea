<script lang="ts">
	import { setContext, type Snippet } from 'svelte';

	type Props = {
		id: string;
		/** Draws every panel in the section without its box. */
		plain?: boolean;
		children: Snippet;
	};

	const { id, plain = false, children }: Props = $props();

	setContext('plain', () => plain);
</script>

<section {id} class={['page-section', { plain }]}>
	{@render children()}
</section>

<style>
	section {
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--size-3);
		scroll-margin-top: var(--size-4);
	}

	.plain {
		column-gap: var(--size-4);
	}

	section > :global(*) {
		grid-column: 1 / -1;
	}

	:global(.page-section + .page-section) {
		margin-top: var(--size-4);
	}
</style>
