<script lang="ts">
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { flowsOf } from '#lib/web/shared/alluvial.ts';
	import AlluvialChart from '#lib/web/components/ui-chart-alluvial/ui-chart-alluvial.svelte';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		spending: Spending.Spent | undefined;
		account: string;
		parts: string[];
		colours: Record<string, number>;
	};

	const { spending, account, parts, colours }: Props = $props();

	const rows = $derived(Spending.rowsOf(spending, account));
	const flows = $derived(flowsOf({ rows, account, parts, colours }));
</script>

{#if rows.length > 1}
	<AlluvialChart
		{flows}
		label="How {nameOf(account)} divides into the accounts under it, two levels deep"
	/>
{:else}
	<p>Nothing under {nameOf(account)} to divide.</p>
{/if}
