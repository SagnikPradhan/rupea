<script lang="ts">
	type Props = { page: 'home' | 'spending' | 'worth' | 'ledger' };

	const { page }: Props = $props();

	const BARS = [24, 30, 21, 34, 27, 22, 38, 29, 25, 32];
	const STEPS = [30, 28, 27, 24, 22, 21, 17, 15, 12, 9];
	const ROWS = [0, 1, 2, 3];

	const worth = `M0,${STEPS[0]} ${STEPS.map((y, i) => `H${i * 10} V${y}`).join(' ')} H100`;
</script>

<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
	{#if page === 'spending'}
		{#each BARS as height, i (i)}
			<rect class="soft" x={i * 10 + 2} y={40 - height} width="6" height={height * 0.4} />
			<rect class="strong" x={i * 10 + 2} y={40 - height * 0.6} width="6" height={height * 0.6} />
		{/each}
	{/if}
	{#if page === 'worth' || page === 'home'}
		<path class="area" d="{worth} V40 H0 Z" />
		<path class="line" d={worth} />
	{/if}
	{#if page === 'home'}
		<rect class="strong" x="0" y="32" width="100" height="8" />
	{/if}
	{#if page === 'ledger'}
		{#each ROWS as row (row)}
			<rect class="strong" x="0" y={row * 10 + 3} width="16" height="4" />
			<rect class="soft" x="22" y={row * 10 + 3} width={40 - row * 6} height="4" />
			<rect class="strong" x="84" y={row * 10 + 3} width="16" height="4" />
		{/each}
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: var(--size-4);
	}

	.soft,
	.area {
		fill: var(--color-ink-2);
	}

	.strong {
		fill: var(--color-ink-3);
	}

	.line {
		fill: none;
		stroke: var(--color-ink-5);
		stroke-width: var(--size-line-1);
		vector-effect: non-scaling-stroke;
	}
</style>
