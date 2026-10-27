<script lang="ts">
	import type { Filter } from '#lib/shared/filter.ts';
	import AccountPicker from '#lib/web/components/account-picker/account-picker.svelte';
	import PeriodPicker from '#lib/web/components/period-picker/period-picker.svelte';

	type Props = {
		filter: Filter;
		/** Every account and the one the server draws it under. */
		accounts: { account: string; parent: string | null }[];
		/** The viewer's ISO day. */
		today: string;
		/** The ledger's first day, or none while it is empty. */
		first: string | null;
	};

	const { filter, accounts, today, first }: Props = $props();

	/** The days a custom period starts from: those picked, or the whole ledger. */
	const shown = $derived(
		filter.period.kind === 'custom'
			? { from: filter.period.from, to: filter.period.to }
			: { from: first ?? today, to: today },
	);
</script>

<PeriodPicker current={filter.period} {shown} {today} {first} />
<AccountPicker current={filter.account || null} {accounts} top={null} />
