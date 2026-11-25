<script lang="ts">
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';

	type Props = { totals: { label: string; figure: string; detail: string }[] };

	const { totals }: Props = $props();
</script>

<section aria-label="Totals">
	{#each totals as { label, figure, detail } (label)}
		<Kpi {label} {figure} {detail} />
	{/each}
</section>

<style>
	section {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2) var(--size-4);
		padding-bottom: var(--size-2);
	}
</style>
