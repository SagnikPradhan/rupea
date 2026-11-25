<script lang="ts">
	type Props = {
		label: string;
		figure?: string;
		soon?: boolean;
		detail?: string;
		tone?: 'positive' | 'negative';
	};

	const { label, figure = '', soon = false, detail, tone }: Props = $props();
</script>

{#if !soon}
	<div class="kpi">
		<p class="label">{label}</p>
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
