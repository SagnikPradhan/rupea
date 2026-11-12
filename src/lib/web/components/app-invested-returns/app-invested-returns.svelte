<script lang="ts">
	import BarRow from '#lib/web/components/ui-bar-row/ui-bar-row.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { prefixOf } from '#lib/web/shared/accounts.ts';
	import { formatCompact, formatPercent, formatReturn } from '#lib/web/shared/format.ts';
	import { type Invested, nestedOf } from '#lib/web/shared/invested.ts';

	const BASE_GROWTH = 0.12;

	type Props = { invested: Invested[] };

	const { invested }: Props = $props();

	const nested = $derived(nestedOf(invested));
	const bestRate = $derived(Math.max(...nested.map((a) => a.gainRate), BASE_GROWTH));
</script>

<Panel title="Returns" subtitle="how much each account has grown on what went in">
	<ul role="list">
		{#each nested as a (a.account)}
			<BarRow
				name={a.name}
				prefix={prefixOf(a.account)}
				detail={[
					`gained ${formatCompact(a.gain)}`,
					a.xirr === null ? '' : `${formatPercent(a.xirr)} a year`,
				].join(' · ')}
				figure={formatReturn(String(a.gain), String(a.cost)) ?? '0%'}
				tone={a.gain >= 0 ? 'positive' : 'negative'}
				share={a.gainRate / bestRate}
			/>
		{/each}
	</ul>
</Panel>

<style>
	ul {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		padding: 0;
	}
</style>
