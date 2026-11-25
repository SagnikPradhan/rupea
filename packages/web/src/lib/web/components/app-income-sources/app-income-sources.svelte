<script lang="ts">
	import { printAmount } from '@rupea/shared/money.ts';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Statement from '#lib/web/components/app-statement/app-statement.svelte';
	import StatementRow from '#lib/web/components/app-statement/app-statement-row.svelte';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		month: Spending.Spent | undefined;
		range: Spending.Spent | undefined;
		name: string;
		period: string;
	};

	const { month, range, name, period }: Props = $props();

	const sources = $derived(Income.sourcesOf(month, range));
</script>

<Panel plain title="Income by source" subtitle="{name}, and {period.toLowerCase()}">
	<Statement head="In rupees" columns={[name, period]}>
		{#each sources.rows as row (row.account)}
			<StatementRow name={row.name} values={[printAmount(row.month), printAmount(row.range)]} />
		{/each}
		<StatementRow
			total
			name="Income"
			values={[printAmount(sources.total.month), printAmount(sources.total.range)]}
		/>
	</Statement>
</Panel>
