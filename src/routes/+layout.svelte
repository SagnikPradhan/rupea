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
		<a href="/">Rupea</a>
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

	header > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--gap-label);
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

	header a {
		color: var(--color-ink);
		font-family: var(--font-heading);
		font-size: var(--text-heading);
		text-decoration: none;
	}

	main {
		padding-bottom: var(--gap-page);
	}
</style>
