<script lang="ts">
	import { page } from '$app/state';
	import { signOut } from '#lib/endpoints/auth.remote.ts';

	const { data, children } = $props();

	const SECTIONS = [
		{ path: 'files', label: 'Files' },
		{ path: 'accounts', label: 'Accounts' },
		{ path: 'expenses', label: 'Expenses' },
		{ path: 'transactions', label: 'Transactions' },
		{ path: 'postings', label: 'Postings' },
		{ path: 'refine', label: 'Refine' },
		{ path: 'import', label: 'Import a statement' },
	];

	const current = (href: string) => (page.url.pathname === href ? 'page' : undefined);
</script>

<div class="shell">
	<aside>
		<nav aria-label="Ledgers">
			<ul role="list">
				{#each data.ledgers as ledger (ledger.handle)}
					<li>
						<p class="label">
							<a href="/l/{ledger.handle}/transactions">{ledger.name}</a>
							{#if !ledger.owned}· shared{/if}
						</p>
						<ul role="list">
							{#each SECTIONS as section (section.path)}
								{@const href = `/l/${ledger.handle}/${section.path}`}
								<li><a {href} aria-current={current(href)}>{section.label}</a></li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
		</nav>

		<form {...signOut}>
			<p>Signed in as {data.user?.username}</p>
			<button>Sign out</button>
		</form>
	</aside>

	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar) minmax(0, 1fr);
		gap: var(--size-5);
		margin-left: calc(-1 * (var(--sidebar) + var(--size-5)));
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: var(--size-4);
		padding-top: var(--size-5);
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: var(--size-5);
		padding-top: var(--size-5);
	}

	.content > :global(*) {
		margin-block: 0;
	}

	ul {
		margin: 0;
		padding: 0;
	}

	nav > ul > li {
		margin: 0;
	}

	nav > ul > li + li {
		margin-top: var(--size-4);
	}

	a {
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	a[aria-current='page'] {
		color: var(--color-accent);
	}

	.label {
		margin-bottom: var(--size-1);
	}

	.label a {
		color: inherit;
	}

	form p {
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	form p {
		margin: 0 0 var(--size-1);
	}

	/* Below this the margin beside the content is narrower than the sidebar. */
	@media (width < 80rem) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
			margin-left: 0;
		}

		aside {
			gap: var(--size-2);
			padding-top: var(--size-2);
		}

		.content {
			gap: var(--size-4);
			padding-top: var(--size-4);
		}

		ul,
		form {
			display: flex;
			flex-wrap: wrap;
			gap: var(--size-1) var(--size-2);
			align-items: center;
		}

		form p {
			margin: 0;
		}
	}
</style>
