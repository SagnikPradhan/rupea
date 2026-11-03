<script lang="ts">
	import { onMount } from 'svelte';
	import Navigation from '#lib/web/components/navigation/navigation.svelte';
	import { page } from '$app/state';
	import '@rupea/theme/index.css';

	const { data, children } = $props();

	const ledgers: { handle: string }[] = $derived(page.data['ledgers'] ?? []);
	const asked = $derived(page.params.handle ?? page.url.searchParams.get('ledger'));
	const handle = $derived((ledgers.find((l) => l.handle === asked) ?? ledgers[0])?.handle ?? null);

	// Lets e2e tests tell when the page has taken over from the server render.
	onMount(() => document.documentElement.toggleAttribute('hydrated', true));
</script>

<div>
	<Navigation {handle} username={data.user?.username ?? null} theme={data.theme} />

	<main>
		{@render children()}
	</main>
</div>

<style>
	main {
		padding-inline: var(--size-4);
		padding-bottom: var(--size-5);
	}

	main > :global(*) {
		margin-block: 0;
	}

	@media (width < 48rem) {
		main {
			padding-inline: var(--size-3);
		}
	}

	@media (width >= 90rem) {
		main {
			padding-inline: var(--size-5);
		}
	}
</style>
