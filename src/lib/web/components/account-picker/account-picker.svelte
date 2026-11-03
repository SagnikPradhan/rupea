<script lang="ts">
	import AccountName from '#lib/web/components/account-name/account-name.svelte';
	import Chip from '#lib/web/components/chip/chip.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		/** The account picked, or none for every account. */
		current: string | null;
		/** Every account that can be picked and the one the server draws it under; those under the current one are offered. */
		accounts: { account: string; parent: string | null }[];
		/** The account every choice is under, which Select all returns to, or none for every account. */
		top: string | null;
	};

	const { current, accounts, top }: Props = $props();

	const parents = $derived(Object.fromEntries(accounts.map((a) => [a.account, a.parent])));
	const choices = $derived([
		...pathTo(current),
		...accounts.filter((a) => a.parent === current).map((a) => a.account),
	]);

	/** An account and those it is drawn under, up to the top one, the topmost first. */
	function pathTo(a: string | null): string[] {
		if (a === null || a === top) return [];
		return [...pathTo(parents[a] ?? null), a];
	}
</script>

<div class="picker">
	<span id="account">Account</span>
	<nav aria-labelledby="account">
		{#each choices as account (account)}
			<Chip href={hrefWith(page.url.searchParams, { account })} on={account === current}>
				<AccountName {account} />
			</Chip>
		{/each}
	</nav>
	<a href={hrefWith(page.url.searchParams, { account: top ?? '' })}>Select all</a>
</div>

<style>
	.picker > nav {
		gap: var(--size-1);
	}
</style>
