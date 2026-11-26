<script lang="ts">
	import Accounts from '#lib/web/components/app-settings-accounts/app-settings-accounts.svelte';
	import Budgets from '#lib/web/components/app-settings-budgets/app-settings-budgets.svelte';
	import Currency from '#lib/web/components/app-settings-currency/app-settings-currency.svelte';
	import PageSection from '#lib/web/components/ui-page-section/ui-page-section.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { BASE } from '#lib/web/shared/format.ts';
	import { setContext } from 'svelte';

	type Props = { ledger: { handle: string; name: string; base: string } };

	const { ledger }: Props = $props();

	setContext(BASE, () => ledger.base);
</script>

<Accounts {ledger} />
<Budgets {ledger} />

<PageSection id="{ledger.handle}-currency">
	<Panel
		title="Currency"
		subtitle="What {ledger.name}'s amounts are in, and how its numbers are written"
	>
		<Currency handle={ledger.handle} base={ledger.base} />
	</Panel>
</PageSection>
