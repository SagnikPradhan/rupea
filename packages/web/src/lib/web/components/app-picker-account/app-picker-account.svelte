<script lang="ts">
	import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';
	import Chip from '#lib/web/components/ui-chip/ui-chip.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		current: string | null;
		accounts: { account: string; parent: string | null }[];
		top: string | null;
	};

	const { current, accounts, top }: Props = $props();

	const parents = $derived(Object.fromEntries(accounts.map((a) => [a.account, a.parent])));
	const choices = $derived([
		...pathTo(current),
		...accounts.filter((a) => a.parent === current).map((a) => a.account),
	]);

	function pathTo(a: string | null): string[] {
		if (a === null || a === top) return [];
		return [...pathTo(parents[a] ?? null), a];
	}
</script>

<FilterSection label="Account" id="account">
	<nav aria-labelledby="account">
		{#each choices as account (account)}
			<Chip href={hrefWith(page.url.searchParams, { account })} on={account === current}>
				<AccountName {account} />
			</Chip>
		{/each}
	</nav>
	<a href={hrefWith(page.url.searchParams, { account: top ?? '' })}>Select all</a>
</FilterSection>

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-1);
	}

	a {
		color: var(--color-ink);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
