<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Two panels with the first nearly twice as wide, as the design draws a chart beside a list. */
		wide?: boolean;
		children: Snippet;
	};

	const { wide = false, children }: Props = $props();
</script>

<div class={{ wide }}>
	{@render children()}
</div>

<style>
	div {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(var(--plot) * 1.5)), 1fr));
		gap: var(--size-3);
	}

	@media (width >= 80rem) {
		.wide {
			grid-template-columns: 19fr 10fr;
		}
	}
</style>
