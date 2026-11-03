<script lang="ts">
	type Props = {
		label: string;
		figure?: string;
		/** Shows a muted Coming soon in place of the figure. */
		soon?: boolean;
		/** One muted line of detail, green or red when the figure means a gain or a loss. */
		detail?: string;
		tone?: 'positive' | 'negative';
	};

	const { label, figure = '', soon = false, detail, tone }: Props = $props();
</script>

<div>
	<p class="text-label">{label}</p>
	{#if soon}
		<p class="text-base">Coming soon</p>
	{:else}
		<p class="text-figure ink">{figure}</p>
	{/if}
	{#if detail}<p class={['text-data', tone]}>{detail}</p>{/if}
</div>

<style>
	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	p {
		margin: 0;
		color: var(--color-muted);
	}

	.ink {
		color: var(--color-ink);
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
