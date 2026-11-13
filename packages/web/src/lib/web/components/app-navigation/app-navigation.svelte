<script lang="ts">
	import { Dialog, LinkPreview } from 'bits-ui';
	import { signOut } from '#lib/endpoints/auth.remote.ts';
	import IconClose from '@tabler/icons-svelte-runes/icons/x';
	import IconLogout from '@tabler/icons-svelte-runes/icons/logout';
	import IconMenu from '@tabler/icons-svelte-runes/icons/menu-2';
	import type { Theme } from '#lib/web/shared/theme.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import Avatar from '#lib/web/components/ui-avatar/ui-avatar.svelte';
	import SyncButton from '#lib/web/components/app-sync-button/app-sync-button.svelte';
	import ThemeToggle from '#lib/web/components/app-theme-toggle/app-theme-toggle.svelte';
	import { flowerOf } from '#lib/web/shared/flower.ts';
	import { PAGES } from '#lib/web/shared/pages.ts';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';

	type Props = {
		handle: string | null;
		username: string | null;
		theme: Theme;
	};

	const { handle, username, theme }: Props = $props();

	const drawer = $state({ open: false });
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
	const tint = $derived(flowerOf(username ?? '').color);
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

{#snippet signedIn()}
	<div class="banner" style:--tint="var(--color-chart-{tint})">
		<Avatar name={username ?? ''} />
	</div>
	<div class="body">
		<div class="who">
			<strong>Hello, {username}</strong>
			<span>You are signed in.</span>
		</div>
		<Button form="log-out">Sign out</Button>
	</div>
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
		<div class={['tools', { wide: username }]}>{@render tools()}</div>
		{#if username}
			<LinkPreview.Root openDelay={100} closeDelay={200}>
				<LinkPreview.Trigger>
					{#snippet child({ props })}
						<button {...props} class="avatar wide" type="button" aria-label="Account">
							<Avatar name={username} />
						</button>
					{/snippet}
				</LinkPreview.Trigger>
				<LinkPreview.Content side="bottom" align="end" sideOffset={4}>
					{#snippet child({ props, wrapperProps })}
						<div {...wrapperProps}><div {...props} class="card">{@render signedIn()}</div></div>
					{/snippet}
				</LinkPreview.Content>
			</LinkPreview.Root>
			<Dialog.Root bind:open={drawer.open}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<span class="menu"><IconButton {...props} label="Menu" icon={IconMenu} outlined /></span
						>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					{#snippet child({ props })}
						<div {...props} class="drawer" aria-label="Menu">
							<div class="bar">
								<span class="brand">Rupea</span>
								<div class="tools">
									{@render tools()}
									<Dialog.Close>
										{#snippet child({ props })}
											<IconButton {...props} label="Close" icon={IconClose} outlined />
										{/snippet}
									</Dialog.Close>
								</div>
							</div>
							<nav aria-label="Pages in the menu">{@render pages()}</nav>
							<div class="account">
								<Avatar name={username} />
								<div class="who">
									<strong>Hello, {username}</strong>
									<span>You are signed in.</span>
								</div>
								<IconButton form="log-out" label="Sign out" icon={IconLogout} outlined />
							</div>
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

	.avatar {
		padding: 0;
		border: 0;
		background: none;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		width: calc(var(--size-2) * 17);
		padding: var(--size-1);
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-2);
		background: var(--color-surface);
		color: var(--color-muted);
	}

	.banner {
		display: flex;
		align-items: flex-end;
		height: calc(var(--size-4) * 1.25);
		padding-inline: var(--size-1);
		border-radius: var(--radius-1);
		background: color-mix(in srgb, var(--tint) 12%, var(--color-surface));
	}

	.banner :global(svg) {
		width: var(--size-4);
		height: var(--size-4);
		margin-bottom: calc(var(--size-4) / -2);
		border: var(--size-line-1) solid var(--color-surface);
		border-radius: 50%;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		padding: var(--size-1);
		padding-top: calc(var(--size-4) / 2 + var(--size-1));
	}

	.body > :global(button) {
		align-self: flex-start;
	}

	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.who strong {
		overflow: hidden;
		font: var(--text-title);
		color: var(--color-ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.who span {
		font: var(--text-label);
	}

	.account {
		display: flex;
		gap: var(--size-2);
		align-items: center;
		padding-top: var(--size-2);
		border-top: var(--size-line-0) solid var(--color-border);
	}

	.account .who {
		flex: 1;
		color: var(--color-muted);
	}

	.account .who strong {
		font: var(--text-base);
	}

	.account .who span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	@media (width < 48rem) {
		header {
			padding: var(--size-3);
		}
	}

	@media (width >= 90rem) {
		header {
			padding-inline: var(--size-5);
		}

		.drawer,
		.menu {
			display: none;
		}
	}

	@media (width < 90rem) {
		.wide {
			display: none;
		}
	}
</style>
