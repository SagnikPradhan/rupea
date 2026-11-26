<script lang="ts">
	import type { Grain, Period } from '@rupea/shared/dates.ts';
	import SpendingAccounts from '#lib/web/components/app-spending-accounts/app-spending-accounts.svelte';
	import SpendingFlows from '#lib/web/components/app-spending-flows/app-spending-flows.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		title: string;
		subtitle: string;
		label: string;
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
</script>

<Panel title={props.title} subtitle={props.subtitle}>
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
		display: grid;
		gap: var(--size-3);
	}
</style>
