<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Bar from '#lib/web/components/ui-bar/ui-bar.svelte';

	type Props = {
		name: string;
		prefix?: string;
		detail?: string;
		figure: string;
		tone?: 'positive' | 'negative';
		share: number;
		limit?: number;
		href?: ResolvedPathname;
	};

	const { name, prefix, detail, figure, tone, share, limit, href }: Props = $props();
</script>

<li>
	<p>
		{#if href}
			<a class="name" {href}>
				{#if prefix}<span class="prefix">{prefix}</span>{/if}{name}
			</a>
		{:else}
			<span class="name">
				{#if prefix}<span class="prefix">{prefix}</span>{/if}{name}
			</span>
		{/if}
		{#if detail}<span class="detail">{detail}</span>{/if}
		<span class={['figure', tone]}>{figure}</span>
	</p>
	<Bar {share} {limit} />
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

	.name {
		flex-grow: 1;
	}

	.detail,
	.figure {
		font: var(--text-data);
	}

	.prefix,
	.detail {
		color: var(--color-muted);
	}

	.figure {
		margin-left: auto;
	}

	a {
		color: inherit;
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
