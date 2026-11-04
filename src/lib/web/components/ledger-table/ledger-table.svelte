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
		container-type: inline-size;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-1);
		line-height: 1.3;
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
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	table :global(th.amount) {
		font-family: var(--font-body);
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

	table :global(tbody tr) {
		border-bottom: var(--line) solid var(--color-border);
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
