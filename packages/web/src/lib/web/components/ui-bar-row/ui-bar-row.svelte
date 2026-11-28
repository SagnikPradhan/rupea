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
	<Bar {share} {limit} negative={tone === 'negative' && limit === undefined} />
</li>

<style>
	li {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	p {
		display: flex;
		align-items: baseline;
		gap: var(--size-2);
	}

	.name {
		flex-grow: 1;
	}

	.detail,
	.figure {
		font: var(--text-label);
		font-family: var(--font-mono);
	}

	.prefix,
	.detail {
		color: var(--color-muted);
	}

	.figure {
		margin-left: auto;
		padding-inline: var(--size-1);
		border-radius: var(--radius-1);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.positive {
		color: var(--color-positive);
		background: color-mix(in srgb, var(--color-positive) 12%, transparent);
	}

	.negative {
		color: var(--color-negative);
		background: color-mix(in srgb, var(--color-negative) 12%, transparent);
	}
</style>
