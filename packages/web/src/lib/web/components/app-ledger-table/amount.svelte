<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PostedOut, QuantityOut } from '@rupea/shared/money.ts';
	import { formatsHere, toneOf } from '#lib/web/shared/format.ts';

	const formats = formatsHere();

	type Props = {
		value: string | QuantityOut | PostedOut | null;
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

	const quantity = $derived(
		typeof value === 'string' ? { amount: value, commodity: formats.base } : value,
	);
	const whole = $derived(!units && quantity?.commodity === formats.base);

	const tone = $derived(quantity ? toneOf(Number(quantity.amount)) : undefined);
	const negative = $derived(tone === 'negative');
	const positive = $derived(signed && tone === 'positive');

	const shown = $derived(quantity && (whole ? formats.whole : formats.units)(quantity.amount));
	const suffix = $derived(quantity && formats.suffix(quantity));
	const exact = $derived(quantity && shown && formats.exact(quantity.amount, shown));
	const title = $derived([exact, note].filter(Boolean).join(' '));
</script>

<td class={['amount', { optional, negative, positive }]} title={title || undefined}>
	{#if shown === null}
		{@render children?.()}
	{:else}
		{shown}{#if suffix}&nbsp;<span class="commodity">{suffix}</span>{/if}
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
