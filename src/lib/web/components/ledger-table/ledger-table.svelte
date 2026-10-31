<script lang="ts" module>
	/** A `date` or `amount` column fits its widest cell; the others share what is left. */
	export type Column = { label: string; kind?: 'date' | 'amount'; optional?: boolean };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { columns: Column[]; label?: string; children: Snippet };

	const { columns, label, children }: Props = $props();
</script>

<div>
	<table class="labelled" aria-label={label}>
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
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-data);
		line-height: 1.3;
	}

	table :global(:is(th, td)) {
		padding: 0 0 0 var(--gap-group);
		vertical-align: baseline;
	}

	table :global(:is(th, td):first-child) {
		padding-left: 0;
	}

	thead th {
		padding-bottom: var(--gap-related);
	}

	table :global(th[scope='row']) {
		color: var(--color-ink);
		font-size: var(--text-heading);
		font-weight: 500;
		text-align: left;
	}

	table :global(th[scope='row'] ~ .amount) {
		font-size: var(--text-heading);
	}

	table :global(:is(.date, .amount)) {
		width: 1%;
		white-space: nowrap;
	}

	table :global(td.date) {
		color: var(--color-muted);
	}

	table :global(.amount) {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	table :global(.truncate) {
		max-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	table :global(tbody tr:first-child > *) {
		padding-top: var(--gap-related);
	}

	table :global(tbody tr:last-child > *) {
		padding-bottom: var(--gap-related);
	}

	table :global(tr.child > *) {
		padding-top: var(--gap-tight);
	}

	table :global(tbody.spacer tr > *) {
		padding: 0;
	}

	table :global(tr.child > :not(.amount)) {
		color: var(--color-muted);
	}

	@media (width < 40rem) {
		table :global(:is(th, td)) {
			padding-left: var(--gap-related);
		}

		table :global(.optional) {
			display: none;
		}
	}
</style>
