<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { title: string; children: Snippet };

	const { title, children }: Props = $props();

	const id = $props.id();
</script>

<section aria-labelledby={id}>
	<h4 {id}>{title}</h4>
	{@render children()}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		width: min(100%, calc(var(--size-5) * 5));
		margin-block-start: calc(var(--size-4) - var(--size-2));
	}

	h4 {
		font: var(--text-base);
	}
</style>
