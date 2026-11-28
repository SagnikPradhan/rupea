<script lang="ts">
	import { formatColumn } from '#lib/web/shared/format.ts';

	type Props = {
		grid: string[][];
	};

	const { grid }: Props = $props();

	const width = $derived(Math.max(0, ...grid.map((r) => r.length)));
	const columns = $derived([...Array(width).keys()].map(formatColumn));
</script>

<div class="sheet">
	<table aria-label="Statement">
		<thead>
			<tr>
				<th></th>
				{#each columns as column (column)}
					<th>{column}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each grid as row, index (index)}
				<tr>
					<th>{index + 1}</th>
					{#each columns as column, at (column)}
						<td>{row[at] ?? ''}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.sheet {
		width: 100%;
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
		overflow-x: auto;
	}

	table {
		width: 100%;
		font: var(--text-data);
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--size-1) var(--size-2);
		vertical-align: top;
		border: var(--size-line-0) solid var(--color-border);
	}

	th {
		position: sticky;
		color: var(--color-muted);
		font: var(--text-label);
		font-family: var(--font-mono);
		text-align: center;
		background: var(--color-surface);
	}

	td {
		text-align: left;
	}

	tbody th {
		left: 0;
	}

	td,
	thead th:not(:first-child) {
		min-width: 14ch;
		overflow-wrap: anywhere;
	}

	thead th:first-child {
		left: 0;
		z-index: var(--layer-raised);
	}
</style>
