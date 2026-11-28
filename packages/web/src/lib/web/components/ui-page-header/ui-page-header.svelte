<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		subtitle?: string | Snippet;
		children: Snippet;
		actions?: Snippet;
		/** A line under the subtitle, such as the steps a file is going through. */
		progress?: Snippet;
	};

	const { subtitle, children, actions, progress }: Props = $props();
</script>

<header>
	<div class="title">
		<h1>{@render children()}</h1>
		{#if typeof subtitle === 'string'}<p>{subtitle}</p>{/if}
		{#if typeof subtitle === 'function'}<p>{@render subtitle()}</p>{/if}
		{@render progress?.()}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	.title {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-1);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--size-3);
	}

	@media (width < 80rem) {
		header {
			flex-direction: column;
			align-items: start;
		}
	}

	.title p {
		color: var(--color-muted);
	}

	h1 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--size-2);
		overflow-wrap: anywhere;
	}
</style>
