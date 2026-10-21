<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatAmount, formatExact, formatShort } from '#lib/web/format.ts';

	/** A signed amount is green when positive, and any amount is red when negative. Units keep four places, a compact one shortens to three digits, and a note joins the exact amount in the tooltip. */
	type Props = {
		value: string | null;
		signed?: boolean;
		units?: boolean;
		compact?: boolean;
		note?: string | null;
		optional?: boolean;
		children?: Snippet;
	};

	const {
		value,
		signed = false,
		units = false,
		compact = false,
		note = null,
		optional = false,
		children,
	}: Props = $props();

	const negative = $derived(value?.startsWith('-') ?? false);
	const positive = $derived(signed && value !== null && !negative);
	const shown = $derived(
		value === null ? null : compact ? formatShort(value) : formatAmount(value, units),
	);
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
</style>
