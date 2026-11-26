<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import PageSketch from '#lib/web/components/ui-page-sketch/ui-page-sketch.svelte';
	import { Dialog, LinkPreview } from 'bits-ui';
	import { signOut } from '#lib/endpoints/auth.remote.ts';
	import type { Theme } from '#lib/web/shared/theme.ts';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import Avatar from '#lib/web/components/ui-avatar/ui-avatar.svelte';
	import SyncButton from '#lib/web/components/app-sync-button/app-sync-button.svelte';
	import ThemeToggle from '#lib/web/components/app-theme-toggle/app-theme-toggle.svelte';
	import { flowerOf } from '#lib/web/shared/flower.ts';
	import { PAGES } from '#lib/web/shared/pages.ts';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ledgerHref } from '#lib/web/shared/links.ts';

	type Props = {
		handle: string | null;
		ledgers?: { handle: string; name: string }[];
		username: string | null;
		/** Whether sign-in is off, so there is no signing out. */
		local: boolean;
		theme: Theme;
	};

	const { handle, ledgers = [], username, local, theme }: Props = $props();
	const status = $derived(local ? 'Sign-in is off on this computer.' : 'You are signed in.');

	const drawer = $state({ open: false });
	const section = $derived(page.url.pathname.split('/')[3]);
	const home = $derived({
		label: 'Home',
		href: resolve('/(signed-in)'),
		current: page.route.id === '/(signed-in)',
		icon: 'home' as const,
		about: 'What you own, what you owe, and how last month went',
		sections: [],
	});
	const ledger = $derived(
		handle
			? PAGES.map((p) => ({
					label: p.label,
					href: resolve(`/(signed-in)/l/[handle]/${p.path}`, { handle }),
					current: page.params.handle !== undefined && p.under.some((u) => u === section),
					icon: p.icon,
					about: p.about,
					sections: p.sections,
				}))
			: [],
	);
	const tint = $derived(flowerOf(username ?? '').color);
	const links = $derived([home, ...ledger]);

	afterNavigate(() => (drawer.open = false));
</script>

{#snippet pages(previews: boolean)}
	<ul role="list">
		{#each links as link (link.href)}
			<li>
				{#if previews}
					<LinkPreview.Root openDelay={300} closeDelay={150}>
						<LinkPreview.Trigger>
							{#snippet child({ props })}
								<a
									{...props}
									role={null}
									aria-haspopup={null}
									aria-expanded={null}
									href={link.href}
									aria-current={link.current ? 'page' : undefined}
								>
									{link.label}
								</a>
							{/snippet}
						</LinkPreview.Trigger>
						<LinkPreview.Content side="bottom" sideOffset={8}>
							{#snippet child({ props, wrapperProps })}
								{@const Icon = ICONS[link.icon]}
								<div {...wrapperProps}>
									<div {...props} class="card preview">
										<PageSketch page={link.icon} />
										<strong><Icon />{link.label}</strong>
										<span>{link.about}</span>
										{#if link.sections.length > 0}
											<ul role="list" aria-label="Sections of {link.label}">
												{#each link.sections as part (part.path)}
													<li>
														<a
															href={resolve(`/(signed-in)/l/[handle]/${part.path}`, {
																handle: handle ?? '',
															})}
														>
															{part.label}
														</a>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								</div>
							{/snippet}
						</LinkPreview.Content>
					</LinkPreview.Root>
				{:else}
					<a href={link.href} aria-current={link.current ? 'page' : undefined}>{link.label}</a>
					{#if link.sections.length > 0}
						<ul role="list" class="sections" aria-label="Sections of {link.label}">
							{#each link.sections as part (part.path)}
								<li>
									<a
										href={resolve(`/(signed-in)/l/[handle]/${part.path}`, { handle: handle ?? '' })}
									>
										{part.label}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet signedIn()}
	<div class="banner" style:--tint="var(--color-chart-{tint})">
		<Avatar name={username ?? ''} />
	</div>
	<strong><Avatar name={username ?? ''} />Hello, {username}</strong>
	<span>{status}</span>
	{@render ledgerLinks()}
	<ul role="list">
		<li><a href={resolve('/(signed-in)/settings')}>Settings</a></li>
		{#if !local}<li><button form="log-out">Sign out</button></li>{/if}
	</ul>
{/snippet}

{#snippet ledgerLinks()}
	{#if ledgers.length > 1}
		<ul role="list" aria-label="Ledgers">
			{#each ledgers as l (l.handle)}
				<li>
					<a href={ledgerHref(l.handle)} aria-current={l.handle === handle ? 'page' : undefined}>
						{l.name}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet tools()}
	{#if page.params.handle}<SyncButton handle={page.params.handle} />{/if}
	<ThemeToggle {theme} />
{/snippet}

<header>
	<a class="brand" href={resolve('/(signed-in)')}>Rupea</a>

	{#if username}
		{#if !local}<form {...signOut} id="log-out" hidden></form>{/if}
		<nav aria-label="Pages" class="wide">{@render pages(true)}</nav>
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
						<div {...wrapperProps}>
							<div {...props} class="card preview">{@render signedIn()}</div>
						</div>
					{/snippet}
				</LinkPreview.Content>
			</LinkPreview.Root>
			<Dialog.Root bind:open={drawer.open}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<span class="menu">
							<IconButton {...props} label="Menu" icon={ICONS.menu} outlined />
						</span>
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
											<IconButton {...props} label="Close" icon={ICONS.close} outlined />
										{/snippet}
									</Dialog.Close>
								</div>
							</div>
							<nav aria-label="Pages in the menu">{@render pages(false)}</nav>
							<div class="account">
								<Avatar name={username} />
								<div class="who">
									<strong>Hello, {username}</strong>
									<span>{status}</span>
								</div>
								{#if !local}
									<IconButton form="log-out" label="Sign out" icon={ICONS.signOut} outlined />
								{/if}
							</div>
							<ul role="list" aria-label="Your account">
								<li><a href={resolve('/(signed-in)/settings')}>Settings</a></li>
							</ul>
							{@render ledgerLinks()}
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

	.preview {
		gap: var(--size-0);
		padding: var(--size-2);
	}

	.preview strong {
		display: flex;
		align-items: center;
		gap: var(--size-1);
		margin-top: var(--size-2);
		margin-bottom: var(--size-0);
		font: var(--text-base);
		color: var(--color-ink);
	}

	.preview strong :global(svg) {
		width: var(--size-2);
		height: var(--size-2);
	}

	.preview span {
		font: var(--text-label);
	}

	.preview ul {
		flex-direction: column;
		gap: var(--size-1);
		margin-top: var(--size-2);
	}

	.preview :is(a, button) {
		color: var(--color-ink);
	}

	.preview button {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		cursor: pointer;
	}

	.preview button:hover {
		text-decoration: underline;
	}

	.banner {
		display: flex;
		align-items: center;
		height: var(--size-4);
		padding-inline: var(--size-1);
		border-radius: var(--radius-1);
		background: color-mix(in srgb, var(--tint) 12%, var(--color-surface));
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

	.drawer .sections {
		gap: var(--size-1);
		margin-top: var(--size-1);
		padding-left: var(--size-2);
		font: var(--text-label);
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
