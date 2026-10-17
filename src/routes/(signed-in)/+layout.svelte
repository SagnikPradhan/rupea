<script lang="ts">
	import { page } from '$app/state';
	import { signOut } from '#lib/endpoints/auth.remote.ts';
	import FileTree from '#lib/web/components/file-tree/file-tree.svelte';

	const { data, children } = $props();

	const SECTIONS = [
		{ path: 'files', label: 'Files' },
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
						<a href="/l/{ledger.handle}/transactions">{ledger.name}</a>
						{#if !ledger.owned}<span>shared</span>{/if}
						<ul role="list">
							{#each SECTIONS as section (section.path)}
								{@const href = `/l/${ledger.handle}/${section.path}`}
								<li>
									<a {href} aria-current={current(href)}>{section.label}</a>
									{#if section.path === 'files' && current(href)}
										<FileTree handle={ledger.handle} />
									{/if}
								</li>
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

	ul {
		margin: 0;
		padding: 0;
	}

	ul ul {
		margin-top: var(--size-1);
		padding-left: var(--size-2);
		border-left: 1px solid var(--color-border);
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

	span,
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
			padding-block: var(--size-2);
			border-bottom: 1px solid var(--color-border);
		}

		ul,
		form {
			display: flex;
			flex-wrap: wrap;
			gap: var(--size-1) var(--size-2);
			align-items: center;
		}

		ul ul {
			padding-left: 0;
			border-left: none;
		}

		li:has(:global(nav)) {
			flex-basis: 100%;
		}

		form p {
			margin: 0;
		}
	}
</style>
