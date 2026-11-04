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

<div>
	<p class="label">{label}</p>
	{#if soon}
		<p class="soon">Coming soon</p>
	{:else}
		<p class="figure">{figure}</p>
	{/if}
	{#if detail}<p class={['detail', tone]}>{detail}</p>{/if}
</div>

<style>
	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	p {
		color: var(--color-muted);
	}

	.label {
		font: var(--text-label);
	}

	.soon {
		font: var(--text-base);
	}

	.figure {
		font: var(--text-figure);
		color: var(--color-ink);
	}

	.detail {
		font: var(--text-data);
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
