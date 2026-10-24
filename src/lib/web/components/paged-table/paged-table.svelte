<script lang="ts">
	import LedgerTable, { type Column } from '../ledger-table/ledger-table.svelte';
	import type { Paged } from '#lib/web/shared/paged.svelte.ts';
	import { createWindowVirtualizer } from '@tanstack/svelte-virtual';
	import { untrack, type Snippet } from 'svelte';

	/** How many rows short of the end of those fetched the next page is asked for. */
	const AHEAD = 20;

	type Props = {
		columns: Column[];
		list: Paged<unknown>;
		/** A row's usual height in pixels, until it is measured. */
		height: number;
		empty: string;
		/** Renders the list's row at an index as table rows. */
		row: Snippet<[number]>;
	};

	const { columns, list, height, empty, row }: Props = $props();

	const top = $state({ offset: 0 });
	const virtualizer = createWindowVirtualizer<HTMLTableSectionElement>({
		count: 0,
		estimateSize: () => height,
		overscan: 10,
	});

	const items = $derived($virtualizer.getVirtualItems());
	const shown = $derived(items.filter((item) => item.index < list.rows.length));
	const first = $derived(items[0]);
	const last = $derived(items.at(-1));
	const before = $derived(first ? first.start - top.offset : 0);
	const after = $derived(last ? $virtualizer.getTotalSize() - (last.end - top.offset) : 0);

	// Untracked: setting options updates the virtualizer, which would run the effect again.
	$effect(() => {
		const options = { count: list.rows.length, scrollMargin: top.offset };
		untrack(() => $virtualizer.setOptions(options));
	});

	$effect(() => {
		if ((last?.index ?? 0) >= list.rows.length - AHEAD) untrack(() => void list.more());
	});

	/** Rows are placed from where the table starts on the page. */
	const place = (table: HTMLElement) => {
		top.offset = table.getBoundingClientRect().top + window.scrollY;
	};
</script>

<div {@attach place}>
	<LedgerTable {columns}>
		<tbody class="spacer" aria-hidden="true">
			<tr><td colspan={columns.length} style:height="{before}px"></td></tr>
		</tbody>
		{#each shown as item (item.key)}
			<tbody data-index={item.index} {@attach $virtualizer.measureElement}>
				{@render row(item.index)}
			</tbody>
		{/each}
		<tbody class="spacer" aria-hidden="true">
			<tr><td colspan={columns.length} style:height="{after}px"></td></tr>
		</tbody>
		{#if list.rows.length === 0}
			<tbody>
				<tr><td class="empty" colspan={columns.length}>{empty}</td></tr>
			</tbody>
		{/if}
	</LedgerTable>
</div>

<style>
	.empty {
		color: var(--color-muted);
	}
</style>
