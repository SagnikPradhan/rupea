<script lang="ts">
	import { listWorth } from '#lib/endpoints/accounts.remote.ts';
	import { Range } from '#lib/shared/dates.ts';
	import LineChart from '#lib/web/components/line-chart/line-chart.svelte';
	import RangePicker from '#lib/web/components/range-picker/range-picker.svelte';
	import {
		formatAmount,
		formatChange,
		formatDate,
		formatExact,
		formatIsoDate,
	} from '#lib/web/format.ts';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const { handle }: { handle: string } = $props();

	const range = $derived(v.parse(v.fallback(Range, 'ytd'), page.url.searchParams.get('range')));
	const day = formatIsoDate(new Date());
	const worth = $derived(await listWorth({ handle, range, day }).then((r) => r.data ?? []));

	const first = $derived(worth[0]);
	const last = $derived(worth.at(-1));
</script>

{#if first && last}
	<section aria-labelledby="worth">
		<LineChart
			rows={worth}
			x="day"
			series={[
				{ key: 'worth', label: 'Net worth', role: 'primary' },
				{ key: 'assets', label: 'Assets', role: 'context' },
				{ key: 'liabilities', label: 'Owed', role: 'reference' },
			]}
			label="Net worth from {formatDate(first.day)} to {formatDate(last.day)}, {formatAmount(
				first.worth,
			)} to {formatAmount(last.worth)}"
		>
			{#snippet summary(index: number)}
				{@const shown = worth[index] ?? last}
				{@const change = formatChange(first.worth, shown.worth)}
				<div class="summary">
					<div class="heading">
						<h2 id="worth" class="label">Net worth</h2>
						<RangePicker current={range} />
					</div>
					<p class="figure" title={formatExact(shown.worth)}>{formatAmount(shown.worth)}</p>
					<p>
						<span class={change.negative ? 'negative' : 'positive'}>
							{change.amount}{#if change.percent !== null}&nbsp;({change.percent}){/if}
						</span>
						{formatDate(first.day)} – {formatDate(shown.day)}
						{#if shown.unpriced > 0}
							<span class="nowrap">· excludes {shown.unpriced} unpriced</span>
						{/if}
					</p>
				</div>
			{/snippet}
		</LineChart>
	</section>
{/if}

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin-bottom: var(--size-2);
	}

	.heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--size-2);
	}

	p {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	p.figure {
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: min(var(--font-size-display), 12vw);
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.nowrap {
		white-space: nowrap;
	}
</style>
