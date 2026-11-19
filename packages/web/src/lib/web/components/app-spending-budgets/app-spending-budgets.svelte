<script lang="ts">
	import { printAmount } from '@rupea/shared/money.ts';
	import { page } from '$app/state';
	import BarRow from '#lib/web/components/ui-bar-row/ui-bar-row.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { subtitleOf, type BudgetRow } from '#lib/web/shared/budgets.ts';
	import { formatWhole } from '#lib/web/shared/format.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';

	type Props = { rows: BudgetRow[] };

	const { rows }: Props = $props();
</script>

<Panel title="Budgets" subtitle={subtitleOf(rows)}>
	{#if rows.length > 0}
		<ul role="list">
			{#each rows as row (row.budget.account)}
				<BarRow
					name={nameOf(row.budget.account)}
					href={hrefWith(page.url.searchParams, { budget: row.budget.account })}
					detail="{formatWhole(printAmount(row.budget.spent))} of {formatWhole(
						printAmount(row.budget.limit),
					)}"
					figure={row.percent === null ? '–' : `${row.percent}%`}
					tone={row.over ? 'negative' : undefined}
					share={row.bar.share}
					limit={row.bar.limit}
				/>
			{/each}
		</ul>
	{:else}
		<p>No budgets yet. Add one to see what is left.</p>
	{/if}
</Panel>

<style>
	ul {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		margin: 0;
		padding: 0;
	}

	p {
		color: var(--color-muted);
	}
</style>
