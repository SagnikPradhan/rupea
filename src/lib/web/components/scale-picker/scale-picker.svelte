<script lang="ts">
	import { SCALE_LABELS, type Scale } from '#lib/web/shared/chart.ts';
	import { page } from '$app/state';

	const { current }: { current: Scale } = $props();

	const hrefOf = (scale: string) =>
		`?${new URLSearchParams({ ...Object.fromEntries(page.url.searchParams), scale })}`;
</script>

<nav aria-label="Scale">
	{#each Object.entries(SCALE_LABELS) as [scale, name] (scale)}
		<a
			href={hrefOf(scale)}
			class="label plain"
			aria-current={scale === current ? 'page' : undefined}>{name}</a
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
	}
</style>
