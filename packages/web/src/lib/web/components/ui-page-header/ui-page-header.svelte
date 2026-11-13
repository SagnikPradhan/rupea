<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
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

	.title p {
		color: var(--color-muted);
	}

	h1 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2);
		align-items: baseline;
		overflow-wrap: anywhere;
	}
</style>
