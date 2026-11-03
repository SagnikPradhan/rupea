<script lang="ts">
	import Bar from '#lib/web/components/bar/bar.svelte';

	type Props = {
		name: string;
		/** Muted figures beside the name. */
		detail?: string;
		/** The figure at the end, green or red when it means a gain or a loss. */
		figure: string;
		tone?: 'positive' | 'negative';
		share: number;
	};

	const { name, detail, figure, tone, share }: Props = $props();
</script>

<li>
	<p>
		<span class="name">{name}</span>
		{#if detail}<span class="text-data detail">{detail}</span>{/if}
		<span class={['text-data figure', tone]}>{figure}</span>
	</p>
	<Bar {share} />
</li>

<style>
	li {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin: 0;
	}

	p {
		display: flex;
		gap: var(--size-2);
		align-items: baseline;
		max-width: none;
		margin: 0;
	}

	.detail {
		color: var(--color-muted);
	}

	.figure {
		margin-left: auto;
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
