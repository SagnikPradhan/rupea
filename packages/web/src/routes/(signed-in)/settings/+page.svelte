<script lang="ts">
	import SettingsLedger from '#lib/web/components/app-settings-ledger/app-settings-ledger.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';

	const { data } = $props();
</script>

<PageHeader subtitle="How each of your ledgers is set up">Settings</PageHeader>

<nav aria-label="Settings sections">
	{#each data.ledgers as l (l.handle)}
		<ul role="list" aria-label={l.name}>
			{#if data.ledgers.length > 1}<li class="name">{l.name}</li>{/if}
			<li><a href="#{l.handle}-accounts">Accounts</a></li>
			<li><a href="#{l.handle}-budgets">Budgets</a></li>
		</ul>
	{/each}
</nav>

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
