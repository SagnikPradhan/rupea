<script lang="ts">
	import type { Filter } from '@rupea/shared/filter.ts';
	import Chip from '#lib/web/components/ui-chip/ui-chip.svelte';
	import { formatBucket, formatDate } from '#lib/web/shared/format.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = { filter: Filter };

	const { filter }: Props = $props();

	const params = $derived([...page.url.searchParams]);

	const period = $derived.by(() => {
		const p = filter.period;
		if (p.kind === 'month') return formatBucket.month(`${p.at}-01`);
		if (p.kind === 'year') return p.at;
		if (p.kind === 'custom') return `${formatDate(p.from)} – ${formatDate(p.to)}`;
		return 'All time';
	});
</script>

{#if filter.period.kind !== 'all'}
	<Chip toggle on href={hrefWith(params, { at: '', range: '', from: '', to: '' })}>{period}</Chip>
{/if}
{#if filter.account}
	<Chip toggle on href={hrefWith(params, { account: '' })}>{filter.account}</Chip>
{/if}
