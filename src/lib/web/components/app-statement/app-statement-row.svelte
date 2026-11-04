<script lang="ts">
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';

	type Props = {
		name: string;
		/** Amounts in whole rupees, one per column. */
		values: string[];
		change?: string;
		total?: boolean;
	};

	const { name, values, change, total = false }: Props = $props();
</script>

<tr class={{ total }}>
	<td>{name}</td>
	{#each values as value, i (i)}
		<Amount {value} />
	{/each}
	{#if change !== undefined}<td class="amount">{change}</td>{/if}
</tr>

<style>
	td {
		padding-block: var(--size-1);
		text-align: left;
	}

	.total {
		border-top: var(--size-line-0) solid var(--color-border);
	}
</style>
