<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The title over the names; with no columns it also spans the one amount beside each name. */
		head: string;
		/** The titles over the amounts. */
		columns?: string[];
		children: Snippet;
	};

	const { head, columns = [], children }: Props = $props();
</script>

<div>
	<table>
		<thead>
			<tr>
				<th class="text-label" colspan={columns.length === 0 ? 2 : 1}>{head}</th>
				{#each columns as column (column)}
					<th class="text-label amount">{column}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{@render children()}
		</tbody>
	</table>
</div>

<style>
	div {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		padding: 0 0 var(--size-0);
		color: var(--color-muted);
		font-weight: 400;
		text-align: left;
	}

	th.amount {
		padding-left: var(--size-1);
		text-align: right;
	}

	table :global(td.amount) {
		padding-left: var(--size-1);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
</style>
