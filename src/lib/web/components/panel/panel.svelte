<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** One line saying what the panel shows. */
		subtitle: string;
		/** Marks the panel as a placeholder for data Rupea does not read yet. */
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
	section {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		min-width: 0;
		padding: var(--size-3);
		border: var(--line) solid var(--color-subtle);
		border-radius: var(--radius);
	}

	.soon {
		align-items: center;
		justify-content: center;
		min-height: calc(var(--size-5) * 2);
		border: var(--line) dashed var(--color-border);
		text-align: center;
	}

	header {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	.soon header {
		align-items: center;
	}

	h2,
	p {
		margin: 0;
	}

	p {
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}
</style>
