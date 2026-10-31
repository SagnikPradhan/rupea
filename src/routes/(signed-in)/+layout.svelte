<script lang="ts">
	import { page } from '$app/state';

	const { data, children } = $props();

	/** A ledger's pages, grouped; a group leads to its first page and lists the rest beneath. */
	const GROUPS = [
		{ label: 'Accounts', pages: [{ path: 'accounts', label: 'Accounts' }] },
		{ label: 'Expenses', pages: [{ path: 'expenses', label: 'Expenses' }] },
		{
			label: 'Transactions',
			pages: [
				{ path: 'transactions', label: 'Transactions' },
				{ path: 'postings', label: 'Postings' },
			],
		},
		{
			label: 'Files',
			pages: [
				{ path: 'files', label: 'Files' },
				{ path: 'import', label: 'Import' },
				{ path: 'refine', label: 'Refine' },
			],
		},
	];

	const handle = $derived(page.params.handle);
	const path = $derived(page.url.pathname.split('/')[3]);
	const group = $derived(GROUPS.find((g) => g.pages.some((p) => p.path === path)));

	const current = (href: string) => (page.url.pathname === href ? 'page' : undefined);

	const isOpen = (ledger: string, label: string) =>
		ledger === handle && label === group?.label ? 'true' : undefined;
</script>

<div class="shell">
	<nav aria-label="Ledgers">
		{#each data.ledgers as ledger (ledger.handle)}
			<ul role="list">
				<li class="ledger">
					<a href="/l/{ledger.handle}/transactions">{ledger.name}</a>
					{#if !ledger.owned}· shared{/if}
				</li>
				{#each GROUPS as g (g.label)}
					{@const href = `/l/${ledger.handle}/${g.pages[0]?.path}`}
					<li>
						<a {href} aria-current={current(href) ?? isOpen(ledger.handle, g.label)}>{g.label}</a>
					</li>
				{/each}
			</ul>
		{/each}
	</nav>

	{#if handle && group && group.pages.length > 1}
		<nav aria-label={group.label} class="pages">
			{#each group.pages as p (p.path)}
				{@const href = `/l/${handle}/${p.path}`}
				<a {href} aria-current={current(href)}>{p.label}</a>
			{/each}
		</nav>
	{/if}

	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-label) var(--gap-group);
		align-items: baseline;
		padding-block: var(--gap-label);
	}

	.pages {
		gap: var(--gap-group);
		padding-block: 0;
		font-size: var(--text-small);
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-label) var(--gap-group);
		margin: 0;
		padding: 0;
	}

	li {
		margin: 0;
	}

	.ledger a {
		color: var(--color-muted);
	}

	a {
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: var(--gap-block);
		padding-top: var(--gap-block);
	}

	.content > :global(*) {
		margin-block: 0;
	}

	@media (width < 80rem) {
		.content {
			gap: var(--gap-block);
			padding-top: var(--gap-block);
		}
	}
</style>
