<script lang="ts">
	import Accounts from '#lib/web/components/app-settings-accounts/app-settings-accounts.svelte';
	import Budgets from '#lib/web/components/app-settings-budgets/app-settings-budgets.svelte';
	import Currency from '#lib/web/components/app-settings-currency/app-settings-currency.svelte';
	import SettingGroup from '#lib/web/components/ui-setting-group/ui-setting-group.svelte';
	import { BASE } from '#lib/web/shared/format.ts';
	import { setContext } from 'svelte';

	type Props = { ledger: { handle: string; name: string; base: string } };

	const { ledger }: Props = $props();

	setContext(BASE, () => ledger.base);
</script>

<SettingGroup id={ledger.handle} title={ledger.name}>
	<Currency handle={ledger.handle} base={ledger.base} />
	<Accounts {ledger} />
	<Budgets {ledger} />
</SettingGroup>
