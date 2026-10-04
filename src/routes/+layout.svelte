<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';

	const { children } = $props();

	// Lets e2e tests tell when the page has taken over from the server render.
	onMount(() => document.documentElement.toggleAttribute('hydrated', true));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
