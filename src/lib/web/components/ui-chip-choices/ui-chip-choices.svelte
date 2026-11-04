<script lang="ts">
	import Chip from '#lib/web/components/ui-chip/ui-chip.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		param: string;
		label: string;
		choices: Record<string, string>;
		current: string;
	};

	const { param, label, choices, current }: Props = $props();
</script>

<nav aria-label={label}>
	{#each Object.entries(choices) as [value, name] (value)}
		<Chip href={hrefWith(page.url.searchParams, { [param]: value })} on={value === current}>
			{name}
		</Chip>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
	}
</style>
