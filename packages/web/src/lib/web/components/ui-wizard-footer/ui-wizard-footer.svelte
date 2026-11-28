<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The way out of the step, on the left. */
		back?: Snippet;
		/** The step's main action, on the right. */
		next?: Snippet;
	};

	const { back, next }: Props = $props();
</script>

<footer>
	<div>{@render back?.()}</div>
	<div>{@render next?.()}</div>
</footer>

<style>
	footer,
	div {
		display: flex;
		align-items: center;
		gap: var(--size-2);
	}

	footer {
		justify-content: space-between;
	}
</style>
