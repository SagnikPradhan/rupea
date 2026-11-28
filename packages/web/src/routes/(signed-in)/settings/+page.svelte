<script lang="ts">
	import SettingsLedger from '#lib/web/components/app-settings-ledger/app-settings-ledger.svelte';
	import SettingsYou from '#lib/web/components/app-settings-you/app-settings-you.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import SettingGroup from '#lib/web/components/ui-setting-group/ui-setting-group.svelte';

	const { data } = $props();

	const shown = $state({ id: 'you' });

	/** Marks the link to the part of the page in view, as the page scrolls. */
	const following = (nav: HTMLElement) => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) shown.id = e.target.id;
			},
			{ rootMargin: '0px 0px -75% 0px' },
		);
		for (const a of nav.querySelectorAll('a')) {
			const target = document.getElementById(a.hash.slice(1));
			if (target) observer.observe(target);
		}
		return () => observer.disconnect();
	};

	const current = (id: string) => (shown.id === id ? 'location' : undefined);
</script>

<PageHeader subtitle="Who you are, and how each of your ledgers is set up">Settings</PageHeader>

<div class="settings">
	<nav aria-label="Settings sections" {@attach following}>
		<ul role="list">
			<li><a href="#you" aria-current={current('you')}>You</a></li>
			{#each data.ledgers as l (l.handle)}
				<li>
					<a href="#{l.handle}" aria-current={current(l.handle)}>{l.name}</a>
					<ul role="list" aria-label={l.name}>
						<li>
							<a href="#{l.handle}-currency" aria-current={current(`${l.handle}-currency`)}>
								Currency
							</a>
						</li>
						<li>
							<a href="#{l.handle}-accounts" aria-current={current(`${l.handle}-accounts`)}>
								Cards and loans
							</a>
						</li>
						<li>
							<a href="#{l.handle}-budgets" aria-current={current(`${l.handle}-budgets`)}>
								Budgets
							</a>
						</li>
					</ul>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="groups">
		{#if data.user}
			<SettingGroup id="you" title="You">
				<SettingsYou
					username={data.user.username}
					email={data.user.email}
					local={data.user.local}
				/>
			</SettingGroup>
		{/if}

		{#each data.ledgers as l (`${l.handle} ${l.base}`)}
			<SettingsLedger ledger={l} />
		{:else}
			<p>You have no ledgers yet.</p>
		{/each}
	</div>
</div>

<style>
	.settings {
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--size-4);
	}

	nav {
		position: sticky;
		inset-block-start: var(--size-4);
		align-self: start;
		grid-column: span 2;
	}

	.groups {
		display: flex;
		flex-direction: column;
		gap: var(--size-5);
		grid-column: 3 / -1;
		min-width: 0;
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	nav > ul {
		gap: var(--size-3);
	}

	ul ul {
		margin-block-start: var(--size-1);
		padding-inline-start: var(--size-2);
	}

	a {
		color: var(--color-muted);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	a[aria-current] {
		color: var(--color-ink);
	}

	@media (width < 80rem) {
		nav {
			display: none;
		}

		.groups {
			grid-column: 1 / -1;
		}
	}
</style>
