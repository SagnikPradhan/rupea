<script lang="ts">
	import SettingsLedger from '#lib/web/components/app-settings-ledger/app-settings-ledger.svelte';
	import SettingsYou from '#lib/web/components/app-settings-you/app-settings-you.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PageSection from '#lib/web/components/ui-page-section/ui-page-section.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';

	const { data } = $props();
</script>

<PageHeader subtitle="Who you are, and how each of your ledgers is set up">Settings</PageHeader>

<nav aria-label="Settings sections">
	<ul role="list" aria-label="You">
		<li><a href="#you">You</a></li>
	</ul>
	{#each data.ledgers as l (l.handle)}
		<ul role="list" aria-label={l.name}>
			{#if data.ledgers.length > 1}<li class="name">{l.name}</li>{/if}
			<li><a href="#{l.handle}-accounts">Accounts</a></li>
			<li><a href="#{l.handle}-budgets">Budgets</a></li>
		</ul>
	{/each}
</nav>

{#if data.user}
	<PageSection id="you">
		<Panel title="You" subtitle="Your name in Rupea, and the address you sign in with">
			<SettingsYou username={data.user.username} email={data.user.email} local={data.user.local} />
		</Panel>
	</PageSection>
{/if}

{#each data.ledgers as l (l.handle)}
	<SettingsLedger ledger={l} />
{:else}
	<p>You have no ledgers yet.</p>
{/each}

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1) var(--size-4);
	}

	ul {
		display: flex;
		gap: var(--size-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.name {
		color: var(--color-ink);
	}

	a {
		color: var(--color-muted);
	}
</style>
