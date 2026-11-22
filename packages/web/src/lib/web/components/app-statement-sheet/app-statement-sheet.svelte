<script lang="ts">
	import { formatColumn } from '#lib/web/shared/format.ts';

	type Props = {
		grid: string[][];
		/** Lets it fill most of the window, rather than a corner of it. */
		tall?: boolean;
	};

	const { grid, tall = false }: Props = $props();

	const width = $derived(Math.max(0, ...grid.map((r) => r.length)));
	const columns = $derived([...Array(width).keys()].map(formatColumn));
</script>

<div class={['sheet', { tall }]}>
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
		max-height: var(--size-height-2);
		overflow: auto;
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font: var(--text-data);
	}

	th,
	td {
		padding: var(--size-1) var(--size-2);
		border: var(--size-line-0) solid var(--color-border);
		vertical-align: top;
	}

	th {
		position: sticky;
		background: var(--color-surface);
		color: var(--color-muted);
		font: var(--text-label);
		font-family: var(--font-mono);
		text-align: center;
	}

	td {
		text-align: left;
	}

	thead th {
		top: 0;
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
		z-index: 1;
	}

	.tall {
		max-height: var(--size-height-3);
	}
</style>
