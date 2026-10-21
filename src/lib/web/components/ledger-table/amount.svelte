<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatAmount } from '#lib/web/format.ts';

	/** A `gain` is green when positive; any amount is red when negative. */
	type Props = { value: string | null; gain?: boolean; optional?: boolean; children?: Snippet };

	const { value, gain = false, optional = false, children }: Props = $props();

	const negative = $derived(value?.startsWith('-') ?? false);
	const positive = $derived(gain && value !== null && !negative);
</script>

<td class={['amount', { optional, negative, positive }]}>
	{#if value === null}{@render children?.()}{:else}{formatAmount(value)}{/if}
</td>
