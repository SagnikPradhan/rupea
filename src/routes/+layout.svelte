<script lang="ts">
	import IconLogout from '@tabler/icons-svelte-runes/icons/logout';
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';
	import { signOut } from '#lib/endpoints/auth.remote.ts';
	import IconButton from '#lib/web/components/icon-button/icon-button.svelte';
	import SyncButton from '#lib/web/components/sync-button/sync-button.svelte';
	import ThemeToggle from '#lib/web/components/theme-toggle/theme-toggle.svelte';
	import { page } from '$app/state';
	import '@rupea/theme/index.css';

	const { data, children } = $props();

	// Lets e2e tests tell when the page has taken over from the server render.
	onMount(() => document.documentElement.toggleAttribute('hydrated', true));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<div>
		<a class="plain brand" href="/">Rupea</a>
		<div class="end">
			{#if data.user}<span>{data.user.username}</span>{/if}
			{#if page.params.handle}<SyncButton handle={page.params.handle} />{/if}
			<ThemeToggle theme={data.theme} />
			{#if data.user}
				<form {...signOut}>
					<IconButton label="Sign out" icon={IconLogout} />
				</form>
			{/if}
		</div>
	</div>
</header>

<main>
	{@render children()}
</main>

<style>
	header,
	main {
		padding-inline: var(--inset);
	}

	header {
		border-bottom: 1px solid var(--color-border);
	}

	header > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: var(--bar-height);
	}

	.end {
		display: flex;
		gap: var(--gap-related);
		align-items: center;
	}

	.end > span {
		color: var(--color-muted);
		font-size: var(--text-small);
	}

	main {
		padding-bottom: var(--gap-page);
	}
</style>
