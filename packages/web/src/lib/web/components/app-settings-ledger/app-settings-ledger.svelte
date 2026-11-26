<script lang="ts">
	import Accounts from '#lib/web/components/app-settings-accounts/app-settings-accounts.svelte';
	import Budgets from '#lib/web/components/app-settings-budgets/app-settings-budgets.svelte';

	type Props = { ledger: { handle: string; name: string } };

	const { ledger }: Props = $props();
</script>

<Accounts {ledger} />
<Budgets {ledger} />
