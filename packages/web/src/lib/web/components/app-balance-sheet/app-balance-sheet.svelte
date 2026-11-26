<script lang="ts">
	import { ASSETS, LIABILITIES, type Amount } from '@rupea/shared/money.ts';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Statement from '#lib/web/components/app-statement/app-statement.svelte';
	import StatementRow from '#lib/web/components/app-statement/app-statement-row.svelte';
	import { formatDayMonth } from '#lib/web/shared/format.ts';
	import { groupsOf, owedOf } from '#lib/web/shared/home.ts';

	type Props = {
		accounts: { account: string; total: Amount }[];
		worth: { assets: string; liabilities: string; worth: string } | undefined;
		day: string;
	};

	const { accounts, worth, day }: Props = $props();

	const owned = $derived(groupsOf(accounts, ASSETS));
	const owes = $derived(groupsOf(accounts, LIABILITIES));
	const owed = $derived(owedOf(worth?.liabilities ?? '0'));
</script>

<Panel
	title="Balance sheet"
	subtitle="what you own, and how it is paid for, on {formatDayMonth(day)}"
>
	<div class="sides">
		<Statement head="Assets">
			{#each owned as group (group.name)}
				<StatementRow name={group.name} values={[group.total]} />
			{/each}
			<StatementRow total name="Total assets" values={[worth?.assets ?? '0']} />
		</Statement>
		<Statement head="Owed">
			{#each owes as group (group.name)}
				<StatementRow name={group.name} values={[group.total]} />
			{/each}
			<StatementRow total name="Total owed" values={[owed]} />
			<StatementRow total name="Net worth" values={[worth?.worth ?? '0']} />
		</Statement>
	</div>
</Panel>

<style>
	.sides {
		display: grid;
		align-items: start;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: var(--size-3);
	}

	.sides > :global(*) {
		grid-column: span 6;
	}

	@media (width < 48rem) {
		.sides > :global(*) {
			grid-column: span 12;
		}
	}
</style>
