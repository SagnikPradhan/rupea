<script lang="ts">
	import { childrenOf, nameOf, prefixOf } from '#lib/web/shared/accounts.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		/** The account picked, or none for every account. */
		current: string | null;
		/** Every account that can be picked, of which those right under the current one are offered. */
		accounts: string[];
		/** The account every choice is under, offered first as All, or none for every account. */
		top: string | null;
	};

	const { current, accounts, top }: Props = $props();

	const choices = $derived([
		top,
		...pathTo(current).filter((a) => a.length > (top?.length ?? 0)),
		...childrenOf(accounts, current),
	]);

	/** An account and the accounts above it, the topmost first. */
	function pathTo(a: string | null) {
		const parts = a?.split(':') ?? [];
		return parts.map((_, i) => parts.slice(0, i + 1).join(':'));
	}

	function same(a: string | null, b: string | null) {
		return a?.toLowerCase() === b?.toLowerCase();
	}
</script>

<div class="picker">
	<span id="account">Account</span>
	<nav aria-labelledby="account">
		{#each choices as account (account)}
			<a
				href={hrefWith(page.url.searchParams, { account: account ?? '' })}
				aria-label={account === top ? null : account}
				aria-current={same(account, current) ? 'page' : undefined}
			>
				{#if account === null || account === top}All{:else}<span class="prefix"
						>{prefixOf(account)}</span
					>{nameOf(account)}{/if}
			</a>
		{/each}
	</nav>
</div>

<style>
	.prefix {
		opacity: 0.6;
	}
</style>
