<script lang="ts">
	import { getContext, type Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle: string;
		soon?: boolean;
		plain?: boolean;
		actions?: Snippet;
		children?: Snippet;
	};

	const {
		title,
		subtitle,
		soon = false,
		plain = getContext<(() => boolean) | undefined>('plain')?.() ?? false,
		actions,
		children,
	}: Props = $props();
</script>

<section class={{ soon, plain }}>
	<header>
		<div>
			<h2>{title}</h2>
			<p>{soon ? `Coming soon · ${subtitle}` : subtitle}</p>
		</div>
		{@render actions?.()}
	</header>
	{@render children?.()}
</section>

<style>
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--size-3);
	}

	header div {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	section {
		display: flex;
		min-width: 0;
		padding: var(--size-3);
		flex-direction: column;
		gap: var(--size-3);
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-1);
	}

	.soon {
		min-height: var(--size-height-0);
		align-items: center;
		justify-content: center;
		text-align: center;
		border: var(--size-line-0) dashed var(--color-border);
	}

	.soon header {
		align-items: center;
	}

	.plain {
		padding: 0;
		border: 0;
	}

	p {
		color: var(--color-muted);
		font: var(--text-label);
	}
</style>
