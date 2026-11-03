<script lang="ts">
	import Amount from '#lib/web/components/ledger-table/amount.svelte';

	type Props = {
		name: string;
		/** Amounts in whole rupees, one per column. */
		values: string[];
		/** A last column that is already written, like a change. */
		change?: string;
		/** A total sits under a line. */
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
		border-top: 1px solid var(--color-border);
	}
</style>
