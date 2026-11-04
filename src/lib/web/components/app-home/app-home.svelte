<script lang="ts">
	import { listAccounts, listSpending, listWorth } from '#lib/endpoints/accounts.remote.ts';
	import { ASSETS, INCOME, LIABILITIES } from '#lib/shared/accounts.ts';
	import type { Period } from '#lib/shared/dates.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import NetWorth from '#lib/web/components/app-net-worth/app-net-worth.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { isUnder } from '#lib/web/shared/accounts.ts';
	import Statement from '#lib/web/components/app-statement/app-statement.svelte';
	import StatementRow from '#lib/web/components/app-statement/app-statement-row.svelte';
	import {
		formatWhole,
		formatIsoDate,
		formatDayMonth,
		formatMonthName,
		formatShare,
	} from '#lib/web/shared/format.ts';
	import { groupsOf, lastMonthOf, owedOf, savedOf, statementOf } from '#lib/web/shared/home.ts';

	const { handle, period, account }: { handle: string; period: Period; account: string | null } =
		$props();

	const day = formatIsoDate(new Date());
	const now = { kind: 'month', at: day.slice(0, 7) } as const;
	const lastMonth = { kind: 'month', at: lastMonthOf(day) } as const;

	const worth = $derived(await listWorth({ handle, day, period, account }));
	const balance = $derived(await listAccounts({ handle, day, period: now }));
	const spending = $derived(
		await listSpending({ handle, day, period: lastMonth, account: 'Expenses' }),
	);

	const earning = $derived(await listSpending({ handle, day, period: lastMonth, account: INCOME }));

	const last = $derived(worth.data?.at(-1));
	const accounts = $derived(balance.data ?? []);
	const chosen = $derived(accounts.filter((a) => isUnder(a.account, account)));
	const owned = $derived(groupsOf(chosen, ASSETS));
	const owes = $derived(groupsOf(chosen, LIABILITIES));
	const owed = $derived(owedOf(last?.liabilities ?? '0'));
	const spent = $derived(statementOf('Expenses', spending.data?.[0], spending.data?.[1]));
	const income = $derived(statementOf('Income', earning.data?.[0], earning.data?.[1]));
	const saved = $derived(savedOf(income.total, spent.total));
	const month = $derived(formatMonthName(spending.data?.[0]?.from ?? lastMonth.at + '-01'));
	const before = $derived(
		formatMonthName(spending.data?.[1]?.from ?? lastMonthOf(lastMonth.at + '-01') + '-01'),
	);
</script>

<Issues
	{handle}
	errors={[
		...(worth.errors ?? []),
		...(balance.errors ?? []),
		...(spending.errors ?? []),
		...(earning.errors ?? []),
	]}
/>

<NetWorth worth={worth.data ?? []} {accounts} {account} chart="time" />

<KpiStrip>
	<Kpi
		label="Assets"
		figure={formatWhole(last?.assets ?? '0')}
		detail="in {owned.length} {owned.length === 1 ? 'group' : 'groups'}"
	/>
	<Kpi
		label="Owed"
		figure={formatWhole(owed)}
		detail="{formatShare(owed, last?.assets ?? '0') ?? '0%'} of assets"
	/>
	<Kpi
		label="Saved in {month}"
		figure={formatWhole(saved.amount)}
		detail="{formatShare(saved.amount, income.total.amount) ?? '0%'} of income"
		tone={Number(saved.amount) > 0 ? 'positive' : undefined}
	/>
	<Kpi label="Cash cushion" soon />
</KpiStrip>

<div class="statements">
	<div class="column">
		<Panel
			title="Balance sheet"
			subtitle="what you own, and how it is paid for, on {formatDayMonth(day)}"
		>
			<div class="sides">
				<Statement head="Assets">
					{#each owned as group (group.name)}
						<StatementRow name={group.name} values={[group.total]} />
					{/each}
					<StatementRow total name="Total assets" values={[last?.assets ?? '0']} />
				</Statement>
				<Statement head="Owed">
					{#each owes as group (group.name)}
						<StatementRow name={group.name} values={[group.total]} />
					{/each}
					<StatementRow total name="Total owed" values={[owed]} />
					<StatementRow total name="Net worth" values={[last?.worth ?? '0']} />
				</Statement>
			</div>
		</Panel>

		<Panel title="Needs attention" subtitle="what to look at this week" soon />
	</div>

	<Panel title="Income statement" subtitle="{month} against {before}">
		<Statement head="In rupees" columns={[month, before, 'Change']}>
			{#each income.rows as row (row.name)}
				<StatementRow
					name={row.name}
					values={[row.amount, row.before]}
					change={row.change.amount}
				/>
			{/each}
			<StatementRow
				total
				name="Income"
				values={[income.total.amount, income.total.before]}
				change={income.total.change.amount}
			/>
			{#each spent.rows as row (row.name)}
				<StatementRow
					name={row.name}
					values={[row.amount, row.before]}
					change={row.change.amount}
				/>
			{/each}
			<StatementRow
				total
				name="Spent"
				values={[spent.total.amount, spent.total.before]}
				change={spent.total.change.amount}
			/>
			<StatementRow
				total
				name="Saved"
				values={[saved.amount, saved.before]}
				change={saved.change.amount}
			/>
		</Statement>
	</Panel>
</div>

<Panel title="What moved net worth" subtitle="what saved, gained or lost money this month" soon />

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	.statements {
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--size-3);
		align-items: start;
	}

	.statements > :global(*) {
		grid-column: span 12;
	}

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

	@media (width >= 90rem) {
		.statements > :global(*) {
			grid-column: span 6;
		}
	}
</style>
