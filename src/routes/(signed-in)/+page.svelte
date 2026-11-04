<script lang="ts">
	import { BalanceAccount } from '#lib/shared/accounts.ts';
	import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
	import ChoicePicker from '#lib/web/components/ui-picker-choice/ui-picker-choice.svelte';
	import FilterModal from '#lib/web/components/ui-filter-modal/ui-filter-modal.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import Home from '#lib/web/components/app-home/app-home.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import { formatIsoDate } from '#lib/web/shared/format.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { SIDES, SPANS, SPANS_BRIEF, spanOf } from '#lib/web/shared/home.ts';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const { data } = $props();

	const day = formatIsoDate(new Date());
	const params = $derived(page.url.searchParams);
	const asked = $derived(params.get('ledger'));
	const ledger = $derived(data.ledgers.find((l) => l.handle === asked) ?? data.ledgers[0]);
	const span = $derived(
		v.parse(v.fallback(v.picklist(Object.keys(SPANS)), '24'), params.get('span')),
	);
	const account = $derived(v.parse(BalanceAccount, params.get('account')));
</script>

<PageHeader subtitle="What you own, what you owe, and how last month went">
	Home
	{#snippet actions()}
		<FilterModal params={['span', 'account']}>
			<FilterSection label="Period">
				<ChoicePicker param="span" label="Period" choices={SPANS_BRIEF} current={span} />
			</FilterSection>
			<FilterSection label="Accounts">
				<ChoiceChips param="account" label="Accounts" choices={SIDES} current={account ?? ''} />
			</FilterSection>
		</FilterModal>
	{/snippet}
</PageHeader>

{#if data.ledgers.length > 1}
	<FilterSection label="Ledger" id="ledger">
		<nav aria-labelledby="ledger">
			{#each data.ledgers as l (l.handle)}
				<a
					href={hrefWith(params, { ledger: l.handle })}
					aria-current={l.handle === ledger?.handle ? 'page' : undefined}
				>
					{l.name}
				</a>
			{/each}
		</nav>
	</FilterSection>
{/if}

{#if ledger}
	<Home handle={ledger.handle} period={spanOf(span, day)} {account} />
{:else}
	<p>You have no ledgers yet.</p>
{/if}

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-1) var(--size-3);
	}

	a {
		color: var(--color-ink);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
