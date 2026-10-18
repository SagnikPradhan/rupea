<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A `date` or `amount` column fits its widest cell; the others share what is left. */
	type Column = { label: string; kind?: 'date' | 'amount'; optional?: boolean };
	type Props = { columns: Column[]; children: Snippet };

	const { columns, children }: Props = $props();
</script>

<div>
	<table>
		<thead>
			<tr>
				{#each columns as column (column.label)}
					<th class={[column.kind, { optional: column.optional }]}>{column.label}</th>
				{/each}
			</tr>
		</thead>
		{@render children()}
	</table>
</div>

<style>
	div {
		margin-top: var(--size-3);
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-1);
	}

	table :global(:is(th, td)) {
		padding: 0 0 0 var(--size-3);
		vertical-align: baseline;
	}

	table :global(:is(th, td):first-child) {
		padding-left: 0;
	}

	th {
		padding-bottom: var(--size-1);
		color: var(--color-muted);
		font-weight: 400;
		text-align: left;
	}

	table :global(th[scope='row']) {
		color: var(--color-ink);
		font-weight: 500;
		text-align: left;
	}

	table :global(:is(.date, .amount)) {
		width: 1%;
		white-space: nowrap;
	}

	table :global(.amount) {
		text-align: right;
	}

	table :global(.truncate) {
		max-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	table :global(tbody tr:first-child > *) {
		padding-top: var(--size-1);
	}

	table :global(tbody tr:last-child > *) {
		padding-bottom: var(--size-1);
	}

	table :global(tr.child > *) {
		padding-top: var(--size-0);
	}

	table :global(tr.child > :not(.amount)) {
		color: var(--color-muted);
	}

	table :global(.tag) {
		margin-right: var(--size-1);
		padding: 0 var(--size-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		color: var(--color-muted);
		font-weight: 400;
	}

	@media (width < 40rem) {
		table :global(:is(th, td)) {
			padding-left: var(--size-2);
		}

		table :global(.optional) {
			display: none;
		}
	}
</style>
