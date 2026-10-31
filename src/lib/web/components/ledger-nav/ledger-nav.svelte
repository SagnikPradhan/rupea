<script lang="ts">
	import { PAGE_GROUPS } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = { ledgers: { handle: string; name: string; owned: boolean }[] };

	const { ledgers }: Props = $props();

	const path = $derived(page.url.pathname.split('/')[3]);
	const group = $derived(PAGE_GROUPS.find((g) => g.pages.some((p) => p.path === path)));

	const current = (href: string) => (page.url.pathname === href ? 'page' : undefined);

	const isOpen = (ledger: string, label: string) =>
		ledger === page.params.handle && label === group?.label ? 'true' : undefined;
</script>

<nav aria-label="Ledgers">
	{#each ledgers as ledger (ledger.handle)}
		<ul role="list">
			<li class="ledger">
				<a href="/l/{ledger.handle}/transactions">{ledger.name}</a>
				{#if !ledger.owned}· shared{/if}
			</li>
			{#each PAGE_GROUPS as g (g.label)}
				{@const href = `/l/${ledger.handle}/${g.pages[0]?.path}`}
				<li>
					<a {href} aria-current={current(href) ?? isOpen(ledger.handle, g.label)}>{g.label}</a>
				</li>
			{/each}
		</ul>
	{/each}
</nav>

<style>
	nav,
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-label) var(--gap-group);
		align-items: baseline;
	}

	ul {
		margin: 0;
		padding: 0;
	}

	li {
		margin: 0;
	}

	.ledger a {
		color: var(--color-muted);
	}

	a:not([aria-current]) {
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
