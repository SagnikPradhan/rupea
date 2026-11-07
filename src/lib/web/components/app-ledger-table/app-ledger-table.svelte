<script lang="ts" module>
	export type Column = { label: string; kind?: 'date' | 'account' | 'amount'; optional?: boolean };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		columns: Column[];
		label?: string;
		/** Sizes the columns by their headers, so rows that come and go do not move them. */
		fixed?: boolean;
		children: Snippet;
	};

	const { columns, label, fixed = false, children }: Props = $props();
</script>

<div>
	<table aria-label={label} class={{ fixed }}>
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
		container-type: inline-size;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-1);
		line-height: 1.3;
	}

	thead th {
		border-bottom: var(--size-line-0) solid var(--color-border);
		color: var(--color-muted);
		font: var(--text-label);
		text-align: left;
	}

	table :global(:is(th, td)) {
		padding: var(--size-2) 0 var(--size-2) var(--size-3);
		vertical-align: baseline;
	}

	table :global(:is(th, td):first-child) {
		padding-left: 0;
	}

	table :global(th[scope='row']) {
		color: var(--color-ink);
		font-weight: 400;
		text-align: left;
	}

	table :global(:is(.date, .amount)) {
		width: 1%;
		white-space: nowrap;
	}

	table :global(.amount) {
		width: calc(var(--size-5) * 1.5);
		font-family: var(--font-mono);
		text-align: right;
	}

	table :global(th.amount) {
		font-family: var(--font-body);
	}

	table.fixed {
		table-layout: fixed;
	}

	table.fixed :global(th.date) {
		width: calc(var(--size-5) * 1.25);
	}

	table.fixed :global(th.account) {
		width: calc(var(--size-5) * 3);
	}

	table.fixed :global(th.amount) {
		width: calc(var(--size-5) * 1.5);
	}

	table :global(td.date) {
		color: var(--color-muted);
	}

	table :global(.truncate) {
		max-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	table :global(.truncate wbr) {
		display: none;
	}

	table :global(tbody tr) {
		border-bottom: var(--size-line-0) solid var(--color-border);
	}

	table :global(tr:has(+ .child)) {
		border-bottom-color: transparent;
	}

	table :global(tr:has(+ .child) > *) {
		padding-bottom: var(--size-0);
	}

	table :global(tr.child > *) {
		padding-block: var(--size-0);
	}

	table :global(tbody.spacer tr) {
		border: 0;
	}

	table :global(.spacer td) {
		padding: 0;
	}

	table :global(tr.child > :not(.amount)) {
		color: var(--color-muted);
	}

	@container (width < 48rem) {
		table :global(:is(th, td)) {
			padding-left: var(--size-2);
		}

		table :global(.optional) {
			display: none;
		}
	}
</style>
