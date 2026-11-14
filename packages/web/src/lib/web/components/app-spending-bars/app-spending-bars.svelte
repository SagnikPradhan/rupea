<script lang="ts">
	import { ZERO, printAmount } from '@rupea/shared/money.ts';
	import type { Grain } from '@rupea/shared/dates.ts';
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import { OTHER, PARTS } from '#lib/web/shared/chart.ts';
	import {
		COMPARE_LABELS,
		SCALE_LABELS,
		type Compare,
		type Scale,
	} from '#lib/web/shared/choices.ts';
	import BarChart from '#lib/web/components/ui-chart-bar/ui-chart-bar.svelte';
	import Calendar from '#lib/web/components/ui-chart-calendar/ui-chart-calendar.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import ChoicePicker from '#lib/web/components/ui-picker-choice/ui-picker-choice.svelte';
	import {
		formatAmount,
		formatBucket,
		type Change,
		formatChange,
		formatDate,
		formatExact,
	} from '#lib/web/shared/format.ts';
	import { postingsHref } from '#lib/web/shared/links.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		spending: Spending.Spent | undefined;
		previous: Spending.Spent | undefined;
		account: string;
		parts: string[];
		colours: Record<string, number>;
		bucket: Grain;
		compare: Compare;
		scale: Scale;
		handle: string;
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
		moved: Change | null;
	};

	const {
		spending,
		previous,
		account,
		parts,
		colours,
		bucket,
		compare,
		scale,
		handle,
		first,
		last,
		moved,
	}: Props = $props();

	const bars = $derived(Spending.barsOf({ spending, previous, account, parts }));
	const whole = $derived(Spending.wholeOf({ spending, previous, account, parts }));
	const other = $derived([whole, ...bars].some((b) => b[OTHER] !== '0'));
	const total = $derived(Spending.totalOf(spending, account) ?? ZERO);
	const row = $derived(Spending.rowsOf(spending, account).find((t) => t.account === account));
	const label = $derived(
		`Spending from ${formatDate(first.toString())} to ${formatDate(last.toString())}, ${formatAmount(printAmount(total))} in all`,
	);
	const postingsOn = (day: string) => postingsHref(handle, { account, from: day, to: day });
</script>

<div>
	{#if bucket === 'day'}
		<Calendar rows={bars} x="bucket" y="total" href={postingsOn} {label} {summary} />
	{:else}
		<BarChart
			rows={bars}
			x="bucket"
			{bucket}
			series={[
				...parts.map((p, k) => ({
					key: p,
					label: nameOf(p),
					role: 'part' as const,
					colour: colours[p] ?? k,
				})),
				...(other ? [{ key: OTHER, label: OTHER, role: 'part' as const, colour: PARTS - 1 }] : []),
				...(previous && compare === 'with'
					? [{ key: Spending.PREVIOUS, label: Spending.PREVIOUS, role: 'reference' as const }]
					: []),
			]}
			{whole}
			{label}
			{scale}
			{summary}
		>
			{#snippet controls()}
				{#if previous}
					<ChoicePicker
						param="compare"
						label="Comparison"
						choices={COMPARE_LABELS}
						current={compare}
					/>
				{/if}
				<ChoicePicker param="scale" label="Scale" choices={SCALE_LABELS} current={scale} />
			{/snippet}
		</BarChart>
	{/if}
</div>

{#snippet summary(index: number | null)}
	{@const bar = index === null ? undefined : bars[index]}
	{@const figure = bar?.total ?? printAmount(total)}
	{@const change = bar
		? bar[Spending.PREVIOUS]
			? formatChange(bar[Spending.PREVIOUS], figure)
			: null
		: moved}
	<ChartSummary
		id="spending"
		label="Spending"
		figure={formatAmount(figure)}
		exact={formatExact(figure)}
	>
		{#if change}
			<span class="nowrap">
				{change.amount}{#if change.percent !== null}&nbsp;({change.percent}){/if} vs previous ·
			</span>
		{/if}
		{bar
			? formatBucket[bucket](bar.bucket)
			: `${formatDate(first.toString())} – ${formatDate(last.toString())}`}
		{#if row && row.unpriced > 0}
			<span class="nowrap">· excludes {row.unpriced} unpriced</span>
		{/if}
	</ChartSummary>
{/snippet}

<style>
	.nowrap {
		white-space: nowrap;
	}
</style>
