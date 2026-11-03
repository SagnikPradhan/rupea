<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** One muted line saying what the page answers. */
		subtitle?: string;
		children: Snippet;
		actions?: Snippet;
	};

	const { subtitle, children, actions }: Props = $props();
</script>

<header>
	<div class="title">
		<h1>{@render children()}</h1>
		{#if subtitle}<p>{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-3);
		align-items: end;
		justify-content: space-between;
	}

	@media (width < 80rem) {
		header {
			flex-direction: column;
			align-items: start;
		}
	}

	.title {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	.title p {
		margin: 0;
		color: var(--color-muted);
	}

	h1 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2);
		align-items: baseline;
		margin: 0;
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		align-items: center;
	}
</style>
