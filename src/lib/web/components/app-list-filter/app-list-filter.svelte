<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Period } from '@rupea/shared/dates.ts';
	import AccountPicker from '#lib/web/components/app-picker-account/app-picker-account.svelte';
	import FilterModal from '#lib/web/components/ui-filter-modal/ui-filter-modal.svelte';
	import PeriodPicker from '#lib/web/components/ui-picker-period/ui-picker-period.svelte';

	type Props = {
		period: Period;
		account: string | null;
		accounts: { account: string; parent: string | null }[];
		today: string;
		first: string | null;
		more?: Snippet;
		moreParams?: string[];
	};

	const { period, account, accounts, today, first, more, moreParams = [] }: Props = $props();

	const shown = $derived(
		period.kind === 'custom'
			? { from: period.from, to: period.to }
			: { from: first ?? today, to: today },
	);
</script>

<FilterModal params={['at', 'range', 'from', 'to', 'account', ...moreParams]}>
	<PeriodPicker current={period} {shown} {today} {first} />
	{@render more?.()}
	<AccountPicker current={account} {accounts} top={null} />
</FilterModal>
