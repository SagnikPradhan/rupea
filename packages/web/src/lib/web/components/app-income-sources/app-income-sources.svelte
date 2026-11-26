<script lang="ts">
	import { printAmount } from '@rupea/shared/money.ts';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Statement from '#lib/web/components/app-statement/app-statement.svelte';
	import StatementRow from '#lib/web/components/app-statement/app-statement-row.svelte';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		now: Spending.Spent | undefined;
		before: Spending.Spent | undefined;
		period: string;
	};

	const { now, before, period }: Props = $props();

	const sources = $derived(Income.sourcesOf(now, before));
</script>

<Panel plain title="Income by source" subtitle="Where did the income come from?">
	<Statement head="In rupees" columns={[period, 'Before']}>
		{#each sources.rows as row (row.account)}
			<StatementRow name={row.name} values={[printAmount(row.now), printAmount(row.before)]} />
		{/each}
		<StatementRow
			total
			name="Income"
			values={[printAmount(sources.total.now), printAmount(sources.total.before)]}
		/>
	</Statement>
</Panel>
