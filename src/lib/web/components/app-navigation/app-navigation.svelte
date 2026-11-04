<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { MediaQuery } from 'svelte/reactivity';
	import { signOut } from '#lib/endpoints/auth.remote.ts';
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import type { Theme } from '#lib/server/shared/theme.ts';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import SyncButton from '#lib/web/components/app-sync-button/app-sync-button.svelte';
	import ThemeToggle from '#lib/web/components/app-theme-toggle/app-theme-toggle.svelte';
	import { PAGES } from '#lib/web/shared/pages.ts';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';

	type Props = {
		handle: string | null;
		username: string | null;
		theme: Theme;
	};

	const { handle, username, theme }: Props = $props();

	const wide = new MediaQuery('width >= 90rem');
	const drawer = $state({ open: false });
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

	afterNavigate(() => (drawer.open = false));
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
	<a class="brand" href="/">Rupea</a>

	{#if username}
		<form {...signOut} id="log-out" hidden></form>
		<nav aria-label="Pages" class="wide">{@render pages()}</nav>
	{/if}

	<div class="end">
		{#if inBar}<div class="tools">{@render tools()}</div>{/if}
		{#if username}
			<div class="account wide">{@render account()}</div>
			<Dialog.Root bind:open={drawer.open}>
				<Dialog.Trigger>
					{#snippet child({ props })}<button {...props} class="text menu">Menu</button>{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					{#snippet child({ props })}
						<div {...props} class="drawer" aria-label="Menu">
							<div class="bar">
								<span class="brand">Rupea</span>
								<div class="tools">
									{#if !inBar}{@render tools()}{/if}
									<Dialog.Close>
										{#snippet child({ props })}
											<IconButton {...props} label="Close" icon={IconClose} outlined />
										{/snippet}
									</Dialog.Close>
								</div>
							</div>
							<nav aria-label="Pages in the menu">{@render pages()}</nav>
							<div class="account">{@render account()}</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</Dialog.Root>
		{/if}
	</div>
</header>

<style>
	.tools {
		display: flex;
		align-items: center;
		gap: var(--size-1);
	}

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

	nav a {
		display: block;
	}

	a:hover {
		text-decoration: underline;
	}

	a[aria-current] {
		color: var(--color-ink);
		text-decoration: none;
	}

	.brand {
		font: var(--text-brand);
		color: var(--color-ink);
	}

	.end {
		grid-column: 3;
		min-height: calc(var(--size-2) * 2 + var(--size-line-0) * 2);
		justify-self: end;
		display: flex;
		gap: var(--size-3);
		align-items: center;
	}

	ul {
		display: flex;
		gap: var(--size-3);
		padding: 0;
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

	.drawer {
		position: fixed;
		z-index: 1;
		inset: var(--size-2) var(--size-2) auto auto;
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		width: min(calc(100% - var(--size-4)), calc(var(--size-2) * 23));
		margin: 0;
		padding: var(--size-2);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-surface);
		color: var(--color-ink);
	}

	.bar {
		display: flex;
		gap: var(--size-3);
		align-items: center;
		justify-content: space-between;
	}

	.drawer ul {
		flex-direction: column;
		gap: var(--size-2);
	}

	.drawer .account {
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

		.drawer {
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
