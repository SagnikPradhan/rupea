<script lang="ts">
	import { RANGE_LABELS, type Range } from '#lib/shared/dates.ts';
	import { page } from '$app/state';

	const { current }: { current: Range } = $props();

	const hrefOf = (range: string) =>
		`?${new URLSearchParams({ ...Object.fromEntries(page.url.searchParams), range })}`;
</script>

<nav aria-label="Range">
	{#each Object.entries(RANGE_LABELS) as [range, name] (range)}
		<a
			href={hrefOf(range)}
			class="label plain"
			aria-current={range === current ? 'page' : undefined}>{name}</a
		>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		gap: var(--size-2);
	}

	a:hover {
		color: var(--color-ink);
		text-decoration: none;
	}

	a[aria-current='page'] {
		color: var(--color-accent);
		text-decoration: underline 2px;
		text-underline-offset: var(--size-0);
	}
</style>
