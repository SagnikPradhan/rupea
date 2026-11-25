<script lang="ts">
	import { ZERO, printAmount } from '@rupea/shared/money.ts';
	import type { Grain, Period } from '@rupea/shared/dates.ts';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import SpendingAccounts from '#lib/web/components/app-spending-accounts/app-spending-accounts.svelte';
	import SpendingFlows from '#lib/web/components/app-spending-flows/app-spending-flows.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { formatShare } from '#lib/web/shared/format.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		spending: Spending.Spent | undefined;
		account: string;
		parts: string[];
		colours: Record<string, number>;
		bucket: Grain;
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
		handle: string;
		period: Period;
	};

	const props: Props = $props();

	const total = $derived(Spending.totalOf(props.spending, props.account) ?? ZERO);
	const largest = $derived(
		Spending.largestFirst(Spending.rowsOf(props.spending, props.account), props.account).find(
			(r) => r.parent === props.account,
		),
	);
	const finding = $derived(
		largest
			? `${nameOf(largest.account)} took ${formatShare(printAmount(largest.amount), printAmount(total)) ?? '0%'} of ${nameOf(props.account)}`
			: 'what each account took, and its share of the whole',
	);
</script>

<Panel title="Where the money went" subtitle={finding}>
	<div>
		<SpendingFlows
			spending={props.spending}
			account={props.account}
			parts={props.parts}
			colours={props.colours}
		/>
		<SpendingAccounts {...props} />
	</div>
</Panel>

<style>
	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}
</style>
