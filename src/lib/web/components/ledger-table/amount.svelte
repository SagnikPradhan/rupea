<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatAmount, formatExact } from '#lib/web/format.ts';

	/** A signed amount is green when positive, any amount is red when negative, and a gain sits smaller beneath. Units keep four places. */
	type Props = {
		value: string | null;
		gain?: string | null;
		signed?: boolean;
		units?: boolean;
		optional?: boolean;
		children?: Snippet;
	};

	const {
		value,
		gain = null,
		signed = false,
		units = false,
		optional = false,
		children,
	}: Props = $props();

	const negative = $derived(value?.startsWith('-') ?? false);
	const positive = $derived(signed && value !== null && !negative);
</script>

<td
	class={['amount', { optional, negative, positive }]}
	title={value === null ? undefined : formatExact(value, units)}
>
	{#if value === null}{@render children?.()}{:else}{formatAmount(value, units)}{/if}
	{#if gain !== null}
		<small class={gain.startsWith('-') ? 'negative' : 'positive'} title={formatExact(gain)}
			>{formatAmount(gain)}</small
		>
	{/if}
</td>

<style>
	small {
		display: block;
		font-size: var(--font-size-0);
	}
</style>
