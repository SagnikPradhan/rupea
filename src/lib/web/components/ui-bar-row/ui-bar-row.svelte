<script lang="ts">
	import Bar from '#lib/web/components/ui-bar/ui-bar.svelte';

	type Props = {
		name: string;
		detail?: string;
		figure: string;
		tone?: 'positive' | 'negative';
		share: number;
	};

	const { name, detail, figure, tone, share }: Props = $props();
</script>

<li>
	<p>
		<span class="name">{name}</span>
		{#if detail}<span class="detail">{detail}</span>{/if}
		<span class={['figure', tone]}>{figure}</span>
	</p>
	<Bar {share} />
</li>

<style>
	li {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	p {
		display: flex;
		gap: var(--size-2);
		align-items: baseline;
	}

	.detail,
	.figure {
		font: var(--text-data);
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
