<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle: string;
		soon?: boolean;
		children?: Snippet;
	};

	const { title, subtitle, soon = false, children }: Props = $props();
</script>

<section class={{ soon }}>
	<header>
		<h2>{title}</h2>
		<p>{soon ? `Coming soon · ${subtitle}` : subtitle}</p>
	</header>
	{@render children?.()}
</section>

<style>
	header {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		min-width: 0;
		padding: var(--size-3);
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-1);
	}

	.soon {
		align-items: center;
		justify-content: center;
		min-height: var(--size-height-0);
		border: var(--size-line-0) dashed var(--color-border);
		text-align: center;
	}

	.soon header {
		align-items: center;
	}

	p {
		color: var(--color-muted);
		font: var(--text-label);
	}
</style>
