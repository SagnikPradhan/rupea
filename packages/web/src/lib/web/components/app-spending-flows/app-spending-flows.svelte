<script lang="ts">
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { flowsOf } from '#lib/web/shared/alluvial.ts';
	import AlluvialChart from '#lib/web/components/ui-chart-alluvial/ui-chart-alluvial.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		spending: Spending.Spent | undefined;
		income: Spending.Spent | undefined;
		account: string;
		parts: string[];
		colours: Record<string, number>;
	};

	const { spending, income, account, parts, colours }: Props = $props();

	const rows = $derived(Spending.rowsOf(spending, account));
	const flows = $derived(flowsOf({ rows, account, parts, colours, income: income?.totals ?? [] }));
	const kept = $derived(flows.some((f) => f.into !== null));
</script>

<Panel
	title="Where the money went"
	subtitle={kept
		? 'what came in, then what was spent and what was kept'
		: `what ${nameOf(account)} divides into, two levels deep`}
>
	{#if rows.length > 1}
		<AlluvialChart
			{flows}
			label={kept
				? 'How what came in divides into what was spent and what was kept'
				: `How ${nameOf(account)} divides into the accounts under it, two levels deep`}
		/>
	{:else}
		<p>Nothing under {nameOf(account)} to divide.</p>
	{/if}
</Panel>
