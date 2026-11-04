<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatAmount, formatExact } from '#lib/web/shared/format.ts';

	type Props = {
		value: string | null;
		signed?: boolean;
		units?: boolean;
		note?: string | null;
		optional?: boolean;
		children?: Snippet;
	};

	const {
		value,
		signed = false,
		units = false,
		note = null,
		optional = false,
		children,
	}: Props = $props();

	const negative = $derived(value?.startsWith('-') ?? false);
	const positive = $derived(signed && value !== null && !negative);
	const shown = $derived(value === null ? null : formatAmount(value, units));
	const exact = $derived(value === null || shown === null ? null : formatExact(value, shown));
	const title = $derived([exact, note].filter(Boolean).join(' '));
</script>

<td class={['amount', { optional, negative, positive }]} title={title || undefined}>
	{#if shown === null}
		{@render children?.()}
	{:else}
		{@const [number, ...commodity] = shown.split(' ')}
		{number}{#if commodity.length > 0}&nbsp;<span class="commodity">{commodity.join(' ')}</span
			>{/if}
	{/if}
</td>

<style>
	.commodity {
		color: var(--color-muted);
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
