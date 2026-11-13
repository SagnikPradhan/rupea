<script lang="ts">
	import Donut from '#lib/web/components/ui-chart-donut/ui-chart-donut.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { ASSETS } from '@rupea/shared/money.ts';
	import type { Arc } from '#lib/web/shared/rings.ts';

	type Props = {
		rings: { arcs: Arc[]; levels: number; skipped: number };
		account: string | null;
	};

	const { rings, account }: Props = $props();

	const owing = $derived(
		rings.skipped === 0
			? undefined
			: `${rings.skipped} ${rings.skipped === 1 ? 'account is' : 'accounts are'} below zero, so not drawn`,
	);
</script>

<Panel title="Where it sits" subtitle="each ring is a level of accounts, the inner ring the groups">
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
</Panel>
