<script lang="ts">
	import type { Filter } from '@rupea/shared/filter.ts';
	import { page } from '$app/state';

	const PAUSE = 300;

	const { filter }: { filter: Filter } = $props();

	const kept = $derived([...page.url.searchParams].filter(([key]) => key !== 'description'));

	const typing = { timer: 0 };

	function search(event: Event & { currentTarget: HTMLInputElement }) {
		const form = event.currentTarget.form;
		window.clearTimeout(typing.timer);
		typing.timer = window.setTimeout(() => form?.requestSubmit(), PAUSE);
	}
</script>

<form method="GET" data-sveltekit-replacestate data-sveltekit-reset="false">
	{#each kept as [name, value] (name)}
		{#if value}<input type="hidden" {name} {value} />{/if}
	{/each}
	<input
		type="search"
		name="description"
		value={filter.description}
		placeholder="Search"
		aria-label="Search"
		oninput={search}
	/>
</form>

<style>
	input {
		width: 100%;
	}
</style>
