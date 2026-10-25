<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';
	import ThemeToggle from '#lib/web/components/theme-toggle/theme-toggle.svelte';
	import '@fontsource/poppins/400.css';
	import '@fontsource/poppins/500.css';
	import '@fontsource-variable/google-sans';
	import '@fontsource-variable/geist-mono';
	import '#lib/web/styles/reset.css';
	import '#lib/web/styles/global.css';

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
		<ThemeToggle theme={data.theme} />
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

	header div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--size-1);
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
