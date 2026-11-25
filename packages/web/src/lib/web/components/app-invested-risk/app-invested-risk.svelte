<script lang="ts">
	import AccountChips from '#lib/web/components/app-account-chips/app-account-chips.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Scatter from '#lib/web/components/ui-chart-scatter/ui-chart-scatter.svelte';
	import { dotsOf } from '#lib/web/shared/dots.ts';
	import { formatPercent } from '#lib/web/shared/format.ts';
	import type { Invested } from '#lib/web/shared/invested.ts';
	import type { Arc } from '#lib/web/shared/rings.ts';

	type Props = {
		invested: Invested[];
		swings: { account: string; swing: number }[];
		arcs: Arc[];
		account: string | null;
	};

	const { invested, swings, arcs, account }: Props = $props();

	const dots = $derived(dotsOf(invested, swings, arcs));
	const chips = $derived(
		dots.map((d) => ({
			account: d.key,
			name: d.label,
			figure: `${formatPercent(d.up)} a year, swings ${formatPercent(d.across)}`,
		})),
	);
</script>

<Panel title="Return and risk" subtitle="each dot is an account, bigger dot, more money in it">
	{#if dots.length > 0}
		<Scatter
			{dots}
			across="how much it swings in a year"
			label="Return a year against how much each account swings"
		/>
		<AccountChips {chips} {account} />
	{:else}
		<p>Needs price history.</p>
	{/if}
</Panel>
