<script lang="ts">
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
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
	import ChoicePicker from '#lib/web/components/ui-picker-choice/ui-picker-choice.svelte';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import { hrefWith, postingsHref } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';
	import * as Spending from '#lib/web/shared/spending.ts';

	const formats = formatsHere();

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
	}: Props = $props();

	const bars = $derived(Spending.barsOf({ spending, previous, account, parts }));
	const whole = $derived(Spending.wholeOf({ spending, previous, account, parts }));
	const other = $derived([whole, ...bars].some((b) => b[OTHER] !== '0'));
	const partial = $derived(Spending.partialOf(spending, bucket, last));
	const total = $derived(Spending.totalOf(spending, account) ?? ZERO);
	const label = $derived(
		`Spending from ${formats.date(first.toString())} to ${formats.date(last.toString())}, ${formats.whole(printAmount(total))} in all`,
	);
	const postingsOn = (day: string) => postingsHref(handle, { account, from: day, to: day });
</script>

<Panel title="By category" subtitle="What did each category take, against the period before?">
	{#if bucket === 'day'}
		<Calendar rows={bars} x="bucket" y="total" href={postingsOn} {label} />
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
					href: hrefWith(page.url.searchParams, { account: p }),
				})),
				...(other ? [{ key: OTHER, label: OTHER, role: 'part' as const, colour: PARTS - 1 }] : []),
				...(previous && compare === 'with'
					? [{ key: Spending.PREVIOUS, label: Spending.PREVIOUS, role: 'reference' as const }]
					: []),
			]}
			{whole}
			{label}
			{scale}
			{partial}
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
</Panel>
