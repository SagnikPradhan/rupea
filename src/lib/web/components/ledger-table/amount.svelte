<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatAmount, formatExact } from '#lib/web/format.ts';

	/** A signed amount is green when positive, and any amount is red when negative. Units keep four places, and a note joins the exact amount in the tooltip. */
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
	const title = $derived(
		[value === null ? null : formatExact(value, units), note].filter(Boolean).join(' '),
	);
</script>

<td class={['amount', { optional, negative, positive }]} title={title || undefined}>
	{#if value === null}
		{@render children?.()}
	{:else}
		{@const [number, ...commodity] = formatAmount(value, units).split(' ')}
		{number}{#if commodity.length > 0}&nbsp;<span class="commodity">{commodity.join(' ')}</span
			>{/if}
	{/if}
</td>

<style>
	.commodity {
		color: var(--color-muted);
	}
</style>
