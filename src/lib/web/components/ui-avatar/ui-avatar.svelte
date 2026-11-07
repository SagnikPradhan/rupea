<script lang="ts">
	import { flowerOf } from '#lib/web/shared/flower.ts';

	type Props = { name: string };

	const { name }: Props = $props();

	const flower = $derived(flowerOf(name));
</script>

<svg
	viewBox="0 0 32 32"
	role="img"
	aria-label={name}
	style:--avatar="var(--color-chart-{flower.color})"
>
	<circle cx="16" cy="16" r="16" class="ground" />
	{#each flower.outer as petal, i (i)}
		<path d={petal.d} transform="rotate({petal.rotate} 16 16)" class="outer" />
	{/each}
	{#each flower.inner as petal, i (i)}
		<path d={petal.d} transform="rotate({petal.rotate} 16 16)" class="inner" />
	{/each}
	<circle cx="16" cy="16" r={flower.core} class="outer" />
</svg>

<style>
	svg {
		width: calc(var(--size-2) * 2);
		height: calc(var(--size-2) * 2);
	}

	.ground,
	.inner {
		fill: var(--avatar);
	}

	.outer {
		fill: var(--color-surface);
	}
</style>
