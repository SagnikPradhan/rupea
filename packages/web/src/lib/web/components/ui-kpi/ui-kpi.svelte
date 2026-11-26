<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		label: string;
		figure?: string;
		soon?: boolean;
		detail?: string;
		tone?: 'positive' | 'negative';
		/** Where the figure is explained at length. */
		href?: ResolvedPathname;
	};

	const { label, figure = '', soon = false, detail, tone, href }: Props = $props();
</script>

{#if !soon}
	<div class="kpi">
		{#if href}
			<a class="label" {href}>{label}</a>
		{:else}
			<p class="label">{label}</p>
		{/if}
		<p class="figure">{figure}</p>
		{#if detail}<p class={['detail', tone]}>{detail}</p>{/if}
	</div>
{/if}

<style>
	.kpi {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--size-0);
	}

	.label,
	.detail {
		color: var(--color-muted);
		font: var(--text-label);
	}

	.figure {
		font: var(--text-figure);
		color: var(--color-ink);
	}

	.positive,
	.negative {
		padding-inline: var(--size-1);
		border-radius: var(--radius-1);
	}

	.positive {
		background: color-mix(in srgb, var(--color-positive) 12%, transparent);
		color: var(--color-positive);
	}

	.negative {
		background: color-mix(in srgb, var(--color-negative) 12%, transparent);
		color: var(--color-negative);
	}
</style>
