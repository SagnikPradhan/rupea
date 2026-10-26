<script lang="ts">
	import { RANGE_LABELS } from '#lib/shared/dates.ts';
	import type { Filter } from '#lib/shared/filter.ts';
	import AccountPicker from '#lib/web/components/account-picker/account-picker.svelte';
	import { formatDate } from '#lib/web/shared/format.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = { filter: Filter; accounts: string[] };

	const { filter, accounts }: Props = $props();

	const days = $derived(Boolean(filter.from || filter.to));

	/** Chosen days, like 1 Mar 2026 – 31 Mar 2026, or a single day once. */
	function spanOf(from: string, to: string) {
		if (from === to) return formatDate(from);
		if (!to) return `From ${formatDate(from)}`;
		if (!from) return `Until ${formatDate(to)}`;

		return `${formatDate(from)} – ${formatDate(to)}`;
	}
</script>

<div class="filters" data-sveltekit-reset="false">
	<div class="picker">
		<span id="date">Date</span>
		<nav aria-labelledby="date">
			{#each Object.entries(RANGE_LABELS) as [range, name] (range)}
				<a
					href={hrefWith(page.url.searchParams, { range, from: '', to: '' })}
					aria-current={!days && range === filter.range ? 'page' : undefined}>{name}</a
				>
			{/each}
			{#if days}
				<a href={hrefWith(page.url.searchParams, {})} aria-current="page"
					>{spanOf(filter.from, filter.to)}</a
				>
			{/if}
		</nav>
	</div>

	<AccountPicker current={filter.account || null} {accounts} top={null} />
</div>

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}
</style>
