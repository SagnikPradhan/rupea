<script lang="ts">
	import { PAGE_GROUPS } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	const { children } = $props();

	const handle = $derived(page.params.handle);
	const path = $derived(page.url.pathname.split('/')[3]);
	const group = $derived(PAGE_GROUPS.find((g) => g.pages.some((p) => p.path === path)));

	const current = (href: string) => (page.url.pathname === href ? 'page' : undefined);
</script>

<div class="shell">
	{#if handle && group && group.pages.length > 1}
		<nav aria-label={group.label} class="pages">
			{#each group.pages as p (p.path)}
				{@const href = `/l/${handle}/${p.path}`}
				<a {href} aria-current={current(href)}>{p.label}</a>
			{/each}
		</nav>
	{/if}

	<div class="content grid">
		{@render children()}
	</div>
</div>

<style>
	.pages {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-label) var(--gap-group);
	}

	a:not([aria-current]) {
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.content {
		row-gap: var(--gap-block);
		padding-top: var(--gap-block);
	}

	.content > :global(*) {
		margin-block: 0;
	}
</style>
