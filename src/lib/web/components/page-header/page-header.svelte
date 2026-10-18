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
	<h1>{@render children()}</h1>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	header {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	nav {
		font-size: var(--font-size-0);
		line-height: 1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	ol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-0);
		margin: 0;
		padding: 0;
	}

	li {
		display: inline-flex;
		gap: var(--size-0);
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

	h1 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2);
		align-items: baseline;
		margin: 0;
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		align-items: center;
	}
</style>
