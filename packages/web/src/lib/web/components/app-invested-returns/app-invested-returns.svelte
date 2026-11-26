<script lang="ts">
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import HorizontalBars from '#lib/web/components/ui-chart-hbar/ui-chart-hbar.svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import Totals from '#lib/web/components/ui-chart-totals/ui-chart-totals.svelte';
	import { prefixOf } from '#lib/web/shared/accounts.ts';
	import { BASE, formatsIn } from '#lib/web/shared/format.ts';
	import { getContext } from 'svelte';
	import { type Invested, byDepthOf, groupsInvested, totalsOf } from '#lib/web/shared/invested.ts';

	const formats = formatsIn(getContext<() => string>(BASE)?.());

	type Props = { invested: Invested[] };

	const { invested }: Props = $props();

	const shown = $state({ measure: 'total' });

	const groups = $derived(groupsInvested(invested));
	const totals = $derived(totalsOf(groups));
	const count = $derived(`${groups.length} ${groups.length === 1 ? 'account' : 'accounts'}`);

	const bars = $derived(
		byDepthOf(invested).map((a) => ({
			prefix: prefixOf(a.account),
			name: a.name,
			detail: `${formats.compact(a.gain)} on ${formats.compact(a.cost)}`,
			value: shown.measure === 'xirr' ? a.xirr : a.gainRate,
		})),
	);
</script>

<Panel title="Returns" subtitle="Which accounts have grown most on what went in?">
	{#snippet actions()}
		<SegmentedControl
			label="Return measure"
			segments={[
				{
					name: 'Total',
					chosen: shown.measure === 'total',
					onclick: () => (shown.measure = 'total'),
				},
				{ name: 'XIRR', chosen: shown.measure === 'xirr', onclick: () => (shown.measure = 'xirr') },
			]}
		/>
	{/snippet}

	<Totals
		totals={[
			{
				label: 'Cost',
				figure: formats.whole(String(totals.cost)),
				detail: `across ${count}`,
			},
			{
				label: 'Gain',
				figure: formats.whole(String(totals.gain)),
				detail: `${formats.gain(String(totals.gain), String(totals.cost)) ?? '0%'} on cost`,
			},
		]}
	/>

	<HorizontalBars {bars} label="Return of each account" format={formats.percent} />
</Panel>
