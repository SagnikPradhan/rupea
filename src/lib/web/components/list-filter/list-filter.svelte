<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Period } from '#lib/shared/dates.ts';
	import AccountPicker from '#lib/web/components/account-picker/account-picker.svelte';
	import FilterModal from '#lib/web/components/filter-modal/filter-modal.svelte';
	import PeriodPicker from '#lib/web/components/period-picker/period-picker.svelte';

	type Props = {
		/** The period picked. */
		period: Period;
		/** The account picked, or none for every account. */
		account: string | null;
		/** Every account and the one the server draws it under. */
		accounts: { account: string; parent: string | null }[];
		/** The viewer's ISO day. */
		today: string;
		/** The ledger's first day, or none while it is empty. */
		first: string | null;
		/** More sections of the modal, for a page with filters of its own. */
		more?: Snippet;
		/** The query parameters those sections keep, which Reset clears. */
		moreParams?: string[];
	};

	const { period, account, accounts, today, first, more, moreParams = [] }: Props = $props();

	/** The days a custom period starts from: those picked, or the whole ledger. */
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
