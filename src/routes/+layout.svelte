<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';
	import { signOut } from '#lib/endpoints/auth.remote.ts';
	import ThemeToggle from '#lib/web/components/theme-toggle/theme-toggle.svelte';
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
			{#if data.user}
				<form {...signOut}>
					<span>{data.user.username}</span>
					<button>Sign out</button>
				</form>
			{/if}
			<ThemeToggle theme={data.theme} />
		</div>
	</div>
</header>

<main>
	{@render children()}
</main>

<style>
	header,
	main {
		padding-inline: var(--inset) var(--inset-end);
	}

	header > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--size-1);
	}

	.end,
	form {
		display: flex;
		gap: var(--size-2);
		align-items: center;
	}

	form {
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	header a {
		color: var(--color-ink);
		font-family: var(--font-heading);
		font-size: var(--font-size-2);
		text-decoration: none;
	}

	main {
		padding-bottom: var(--size-6);
	}
</style>
