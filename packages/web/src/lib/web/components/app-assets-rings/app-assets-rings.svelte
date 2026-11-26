<script lang="ts">
	import type { Snippet } from 'svelte';
	import Donut from '#lib/web/components/ui-chart-donut/ui-chart-donut.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { ASSETS } from '@rupea/shared/money.ts';
	import type { Arc } from '#lib/web/shared/rings.ts';

	type Props = {
		rings: { arcs: Arc[]; levels: number; skipped: number };
		account: string | null;
		subtitle: string;
		children?: Snippet;
	};

	const { rings, account, subtitle, children }: Props = $props();

	const owing = $derived(
		rings.skipped === 0
			? undefined
			: `${rings.skipped} ${rings.skipped === 1 ? 'account is' : 'accounts are'} below zero, so not drawn`,
	);
</script>

<Panel title="What you own" {subtitle}>
	{#if rings.arcs.length > 0}
		<Donut
			arcs={rings.arcs}
			levels={rings.levels}
			label="How {account ?? ASSETS} divides across its accounts"
			note={owing}
		/>
	{:else}
		<p>Nothing to divide.</p>
	{/if}
	{@render children?.()}
</Panel>
