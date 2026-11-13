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

<div class="kpi">
	{#if soon}
		<p class="soon">Coming soon</p>
	{:else}
		<p class="figure">{figure}</p>
	{/if}

	<p class="label">
		{label}
		{#if detail}<span class={tone}>{detail}</span>{/if}
	</p>
</div>

<style>
	.kpi {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	.soon {
		color: var(--color-muted);
		font: var(--text-base);
	}

	.figure {
		font: var(--text-figure);
		color: var(--color-ink);
	}

	.label {
		color: var(--color-muted);
		font: var(--text-label);
	}

	.label span {
		display: block;
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
