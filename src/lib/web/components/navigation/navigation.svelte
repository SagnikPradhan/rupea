<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { signOut } from '#lib/endpoints/auth.remote.ts';
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import type { Theme } from '#lib/server/shared/theme.ts';
	import IconButton from '#lib/web/components/icon-button/icon-button.svelte';
	import SyncButton from '#lib/web/components/sync-button/sync-button.svelte';
	import ThemeToggle from '#lib/web/components/theme-toggle/theme-toggle.svelte';
	import { PAGES } from '#lib/web/shared/pages.ts';
	import { page } from '$app/state';

	type Props = {
		/** The ledger the pages belong to; without one only Home is linked. */
		handle: string | null;
		/** The signed-in user; a signed-out visitor sees the brand alone. */
		username: string | null;
		theme: Theme;
	};

	const { handle, username, theme }: Props = $props();

	const wide = new MediaQuery('width >= 90rem');
	const inBar = $derived(wide.current || !username);
	const section = $derived(page.url.pathname.split('/')[3]);
	const home = $derived({
		label: 'Home',
		href: '/',
		current: page.route.id === '/(signed-in)',
	});
	const ledger = $derived(
		handle
			? PAGES.map((p) => ({
					label: p.label,
					href: `/l/${handle}/${p.path}`,
					current: page.params.handle !== undefined && p.path === section,
				}))
			: [],
	);
	const links = $derived([home, ...ledger]);
</script>

{#snippet pages()}
	<ul role="list">
		{#each links as link (link.href)}
			<li><a href={link.href} aria-current={link.current ? 'page' : undefined}>{link.label}</a></li>
		{/each}
	</ul>
{/snippet}

{#snippet account()}
	<span>{username}</span>
	<button class="text" form="log-out">Log out</button>
{/snippet}

{#snippet tools()}
	{#if page.params.handle}<SyncButton handle={page.params.handle} />{/if}
	<ThemeToggle {theme} />
{/snippet}

<header>
	<a class="text-brand" href="/">Rupea</a>

	{#if username}
		<form {...signOut} id="log-out" hidden></form>
		<nav aria-label="Pages" class="wide">{@render pages()}</nav>
	{/if}

	<div class="end">
		{#if inBar}<div class="tools">{@render tools()}</div>{/if}
		{#if username}
			<div class="account wide">{@render account()}</div>
			<button class="text menu" popovertarget="drawer">Menu</button>
		{/if}
	</div>

	{#if username}
		{#key page.url.pathname}
			<div id="drawer" popover>
				<div class="bar">
					<span class="text-brand">Rupea</span>
					<div class="tools">
						{#if !inBar}{@render tools()}{/if}
						<IconButton
							label="Close"
							icon={IconClose}
							outlined
							popovertarget="drawer"
							popovertargetaction="hide"
						/>
					</div>
				</div>
				<nav aria-label="Pages in the menu">{@render pages()}</nav>
				<div class="account">
					<span>{username}</span>
					<button class="text" form="log-out">Log out</button>
				</div>
			</div>
		{/key}
	{/if}
</header>

<style>
	header {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: var(--size-4);
		align-items: center;
		padding: var(--size-4);
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
		text-decoration: none;
	}

	.text-brand {
		color: var(--color-ink);
	}

	nav.wide ul {
		max-width: none;
	}

	.end {
		grid-column: 3;
		justify-self: end;
		display: flex;
		gap: var(--size-3);
		align-items: center;
	}

	.tools {
		display: flex;
		gap: var(--size-1);
		align-items: center;
	}

	nav a {
		display: block;
	}

	ul {
		display: flex;
		gap: var(--size-3);
		margin: 0;
		padding: 0;
	}

	li {
		margin: 0;
	}

	.account {
		display: flex;
		gap: var(--size-3);
		align-items: center;
		color: var(--color-muted);
	}

	.text {
		padding: 0;
		line-height: inherit;
		border: 0;
		background: none;
		color: var(--color-muted);
	}

	.text:hover {
		text-decoration: underline;
	}

	.menu {
		display: none;
	}

	[popover] {
		inset: var(--size-2) var(--size-2) auto auto;
		display: none;
		flex-direction: column;
		gap: var(--size-2);
		width: min(calc(100% - var(--size-4)), calc(var(--size-2) * 23));
		margin: 0;
		padding: var(--size-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-large);
		background: var(--color-surface);
		color: var(--color-ink);
	}

	[popover]:popover-open {
		display: flex;
	}

	.bar {
		display: flex;
		gap: var(--size-3);
		align-items: center;
		justify-content: space-between;
	}

	[popover] ul {
		flex-direction: column;
		gap: var(--size-2);
	}

	[popover] .account {
		flex-direction: column;
		gap: var(--size-2);
		align-items: flex-start;
	}

	@media (width < 48rem) {
		header {
			padding: var(--size-3);
		}
	}

	@media (width >= 90rem) {
		header {
			padding-inline: var(--size-5);
		}

		[popover] {
			display: none;
		}
	}

	@media (width < 90rem) {
		.wide {
			display: none;
		}

		.menu {
			display: block;
		}
	}
</style>
