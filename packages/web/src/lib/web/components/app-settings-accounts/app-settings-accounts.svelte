<script lang="ts">
	import { listAccounts, listTerms } from '#lib/endpoints/accounts.remote.ts';
	import { BalanceAccount, LIABILITIES, parseAmount, printAmount } from '@rupea/shared/money.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import TermsForm from '#lib/web/components/app-terms-form/app-terms-form.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import PageSection from '#lib/web/components/ui-page-section/ui-page-section.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import { formatIsoDate, formatWhole } from '#lib/web/shared/format.ts';
	import { settingsHref } from '#lib/web/shared/links.ts';
	import { askedIn, liabilitiesOf, type Liability } from '#lib/web/shared/settings.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as v from 'valibot';

	type Props = { ledger: { handle: string; name: string } };

	const { ledger }: Props = $props();

	const handle = $derived(ledger.handle);
	const day = formatIsoDate(new Date());

	const [accounts, termed] = $derived(
		await Promise.all([listAccounts(handle), listTerms({ handle, day })]),
	);
	const groups = $derived(liabilitiesOf(accounts.data ?? [], termed.data ?? []));

	const asked = $derived(askedIn(page.url.searchParams, handle));
	const setup = $derived.by(() => {
		const account = v.parse(BalanceAccount, asked.get('setup'));
		return account !== null && isUnder(account, LIABILITIES) ? account : null;
	});
	const current = $derived(
		termed.data?.find((t) => t.account.toLowerCase() === setup?.toLowerCase())?.current ?? {},
	);
	const adding = $derived(asked.get('add') === 'terms');
	const fresh = $state({ name: '' });

	const open = $derived(setup !== null || adding);

	const refresh = () => listTerms({ handle, day }).refresh();
	const close = () => goto(settingsHref(handle, {}));

	const whole = (written: string | undefined) => {
		const parsed = written === undefined ? null : parseAmount(written);
		return parsed === null ? (written ?? '') : formatWhole(printAmount(parsed));
	};
	const dayOf = (d: number | undefined) => (d === undefined ? '' : String(d));
	const rateOf = (r: number | undefined) => (r === undefined ? '' : `${r}%`);
	const setupOf = (l: Liability) => settingsHref(handle, { setup: l.account });
</script>

<PageSection id="{handle}-accounts">
	<PanelGrid wide={open} full={!open}>
		<div class="tables">
			<Panel title="Cards" subtitle="Each card's limit and days in {ledger.name}">
				{#snippet actions()}
					<Button href={settingsHref(handle, { add: 'terms' })}>Add a card or loan</Button>
				{/snippet}
				{#if groups.cards.length > 0}
					<LedgerTable
						label="Cards in {ledger.name}"
						columns={[
							{ label: 'Card' },
							{ label: 'Limit', kind: 'amount' },
							{ label: 'Statement day', kind: 'amount' },
							{ label: 'Due day', kind: 'amount' },
							{ label: 'Rate', kind: 'amount' },
							{ label: 'Terms' },
						]}
					>
						<tbody>
							{#each groups.cards as l (l.account)}
								{@const held = l.terms?.held?.kind === 'card' ? l.terms.held : null}
								<tr>
									<th scope="row" title={l.account}>{nameOf(l.account)}</th>
									<td class="amount">{whole(held?.limit)}</td>
									<td class="amount">{dayOf(held?.statement)}</td>
									<td class="amount">{dayOf(held?.due)}</td>
									<td class="amount">{rateOf(held?.rate)}</td>
									<td><a href={setupOf(l)} aria-label="Edit {l.account}">Edit</a></td>
								</tr>
							{/each}
						</tbody>
					</LedgerTable>
				{:else}
					<p>No cards set up.</p>
				{/if}
			</Panel>

			<Panel title="Loans" subtitle="Each loan's rate and payment in {ledger.name}">
				{#if groups.loans.length > 0}
					<LedgerTable
						label="Loans in {ledger.name}"
						columns={[
							{ label: 'Loan' },
							{ label: 'Rate', kind: 'amount' },
							{ label: 'Monthly', kind: 'amount' },
							{ label: 'Due day', kind: 'amount' },
							{ label: 'Terms' },
						]}
					>
						<tbody>
							{#each groups.loans as l (l.account)}
								{@const held = l.terms?.held?.kind === 'loan' ? l.terms.held : null}
								<tr>
									<th scope="row" title={l.account}>{nameOf(l.account)}</th>
									<td class="amount">{rateOf(held?.rate)}</td>
									<td class="amount">{whole(held?.payment)}</td>
									<td class="amount">{dayOf(held?.due)}</td>
									<td><a href={setupOf(l)} aria-label="Edit {l.account}">Edit</a></td>
								</tr>
							{/each}
						</tbody>
					</LedgerTable>
				{:else}
					<p>No loans set up.</p>
				{/if}
			</Panel>

			{#if groups.unset.length > 0}
				<Panel title="Not set up" subtitle="Say whether each is a card or a loan">
					<LedgerTable
						label="Not set up in {ledger.name}"
						columns={[{ label: 'Account' }, { label: 'Terms' }]}
					>
						<tbody>
							{#each groups.unset as l (l.account)}
								<tr>
									<th scope="row">{l.account}</th>
									<td><a href={setupOf(l)} aria-label="Set up {l.account}">Set up</a></td>
								</tr>
							{/each}
						</tbody>
					</LedgerTable>
				</Panel>
			{/if}
		</div>

		{#if setup}
			<Aside title="Set up {nameOf(setup)}" onclose={close}>
				{#key setup}
					<TermsForm {handle} account={setup} {current} onsaved={refresh} />
				{/key}
			</Aside>
		{/if}
		{#if !setup && adding}
			<Aside title="Add a card or loan" onclose={close}>
				<div class="add">
					<Field label="Name" hint="Under Liabilities, like Loans:Car or Cards:Regalia.">
						<input bind:value={fresh.name} />
					</Field>
					<TermsForm
						{handle}
						account="Liabilities:{fresh.name.trim()}"
						current={{}}
						onsaved={refresh}
					/>
				</div>
			</Aside>
		{/if}
	</PanelGrid>
</PageSection>

<Issues {handle} errors={[...(accounts.errors ?? []), ...(termed.errors ?? [])]} />

<style>
	.tables {
		display: flex;
		flex-direction: column;
		gap: var(--size-4);
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}
</style>
