<script lang="ts">
	import IconNext from '@tabler/icons-svelte-runes/icons/chevron-right';
	import type { Snippet } from 'svelte';

	type Crumb = { href: string; label: string };

	type Props = {
		/** The pages above this one, from the ledger down. */
		trail: Crumb[];
		children: Snippet;
		actions?: Snippet;
	};

	const { trail, children, actions }: Props = $props();
</script>

<header>
	<nav aria-label="Breadcrumb">
		<ol role="list">
			{#each trail as crumb (crumb.href)}
				<li><a href={crumb.href}>{crumb.label}</a><IconNext size={12} aria-hidden="true" /></li>
			{/each}
		</ol>
	</nav>
	<div class="title">
		<h1>{@render children()}</h1>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
</header>

<style>
	header {
		display: flex;
		flex-direction: column;
		gap: var(--gap-group);
	}

	nav {
		font-size: var(--text-small);
		line-height: 1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	ol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-tight);
		margin: 0;
		padding: 0;
	}

	li {
		display: inline-flex;
		gap: var(--gap-tight);
		align-items: center;
		margin: 0;
		color: var(--color-muted);
	}

	a {
		color: var(--color-ink);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.title {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-group);
		align-items: end;
	}

	h1 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-related);
		align-items: baseline;
		margin: 0;
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		margin-left: auto;
		flex-wrap: wrap;
		gap: var(--gap-label);
		align-items: center;
	}
</style>
