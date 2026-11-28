<script lang="ts" module>
	export type Column = { label: string; kind?: 'date' | 'account' | 'amount'; optional?: boolean };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		columns: Column[];
		label?: string;
		fixed?: boolean;
		scroll?: boolean;
		children: Snippet;
	};

	const { columns, label, fixed = false, scroll = true, children }: Props = $props();

	const tracks = (shown: Column[]) =>
		shown
			.map((column, i) => {
				if (column.kind === 'date') return fixed ? 'calc(var(--size-5) * 1.25)' : 'max-content';
				if (column.kind === 'amount') return 'minmax(min-content, var(--size-5))';
				if (i === 0 || fixed) return 'minmax(calc(var(--size-5) * 3), 1fr)';
				return column.kind === 'account' ? 'minmax(0, 2fr)' : 'minmax(min-content, auto)';
			})
			.join(' ');
</script>

<div class={{ scroll }}>
	<table
		aria-label={label}
		style:--wide={tracks(columns)}
		style:--narrow={tracks(columns.filter((c) => !c.optional))}
	>
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
	}

	div.scroll {
		overflow-x: auto;
	}

	table {
		display: grid;
		grid-template-columns: var(--wide);
		font-size: var(--font-size-1);
		line-height: 1.2;
	}

	thead,
	thead tr,
	table :global(:is(tbody, tfoot, tr)) {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
	}

	thead th {
		color: var(--color-muted);
		font: var(--text-label);
		text-align: left;
	}

	thead {
		border-bottom: var(--size-line-0) solid var(--color-border);
	}

	table :global(:is(th, td)) {
		min-width: 0;
		padding: var(--size-1) var(--size-2);
		align-content: center;
	}

	table :global(:is(th, td):first-child) {
		padding-left: 0;
	}

	table :global(:is(th, td):last-child) {
		padding-right: 0;
	}

	table :global(:is(th, td) + :is(th, td)) {
		border-left: var(--size-line-0) solid var(--color-subtle);
	}

	table :global(td[colspan]) {
		grid-column: 1 / -1;
	}

	table :global(th[scope='row']) {
		color: var(--color-ink);
		font-weight: 400;
		text-align: left;
	}

	table :global(:is(.date, .amount)) {
		white-space: nowrap;
	}

	table :global(.amount) {
		font-family: var(--font-mono);
		text-align: right;
	}

	table :global(th.amount) {
		font-family: var(--font-body);
	}

	table :global(td.date) {
		color: var(--color-muted);
	}

	table :global(.truncate) {
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	table :global(.truncate wbr) {
		display: none;
	}

	table :global(tbody tr) {
		border-bottom: var(--size-line-0) solid var(--color-subtle);
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
		table {
			grid-template-columns: var(--narrow);
		}

		table :global(.optional) {
			display: none;
		}

		table :global(:is(th, td):not(.optional, :has(~ :not(.optional)))) {
			padding-right: 0;
		}
	}
</style>
