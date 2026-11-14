<script lang="ts">
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import { AMOUNT_UNIT, type Amount, printAmount, toNumber } from '@rupea/shared/money.ts';
	import { type Grain, bucketOf, bucketsIn } from '@rupea/shared/dates.ts';
	import { formatAmount, formatBucket, formatMonth } from '#lib/web/shared/format.ts';

	type Datum = {
		at: Temporal.PlainDate;
		amount: Amount;
		past: boolean;
		interest: Amount;
	};

	type Series = {
		key: string;
		label: string;
		pins: Datum[];
	};

	type Props = {
		lines: Series[];
		from: Temporal.PlainDate;
		to: Temporal.PlainDate;
		today: Temporal.PlainDate;
		bucket: Grain;
		label: string;
	};

	const { lines, from, to, today, bucket, label }: Props = $props();

	const LEAST = 3;
	const LENGTHS: Record<Grain, Temporal.DurationLike> = {
		day: { days: 1 },
		month: { months: 1 },
		year: { years: 1 },
	};

	const hovered = $state({ pin: null as string | null });

	const widest = $derived(
		Math.max(...lines.flatMap((l) => l.pins.map((p) => toNumber(p.amount))), 0),
	);
	const months = $derived((to.year - from.year) * 12 + to.month - from.month);
	const yearly = $derived(months > 14);
	const unit = $derived(yearly ? 'year' : 'month');
	const daysFrom = (d: Temporal.PlainDate) => from.until(d).days;
	const span = $derived(daysFrom(to) + 1);

	const ticks = $derived(
		bucketsIn({ from, to }, unit).filter((d) => Temporal.PlainDate.compare(d, from) >= 0),
	);

	const leftOf = (d: Temporal.PlainDate, by: Grain) => {
		const end = bucketOf[by](d).add(LENGTHS[by]);
		return Math.min(Math.max((daysFrom(d) + daysFrom(end)) / 2 / span, 0), 1) * 100;
	};
</script>

<div class="chart" style:--lanes={Math.max(lines.length, LEAST)}>
	<div class="plot" role="list" aria-label={label}>
		<span class="today" style:left="{leftOf(today, 'day')}%"></span>
		{#each lines as line, lane (line.key)}
			{#each line.pins as p (`${p.at}${p.past}`)}
				{@const id = `${line.key}${p.at}${p.past}`}
				{@const split = p.interest * 2n >= AMOUNT_UNIT}
				<span
					class={{ pin: true, past: p.past }}
					role="listitem"
					aria-label="{line.label}, {formatAmount(printAmount(p.amount))}, {formatBucket[bucket](
						p.at.toString(),
					)}"
					style:left="{leftOf(p.at, bucket)}%"
					style:--lane={lane}
					style:--spread={Math.sqrt(toNumber(p.amount) / widest)}
					onpointerenter={() => (hovered.pin = id)}
					onpointerleave={() => (hovered.pin = null)}
				>
					<span class={{ circle: true, split }}>
						{#if split}
							<span
								class="core"
								style:--share={Math.sqrt(1 - toNumber(p.interest) / toNumber(p.amount))}
							></span>
						{/if}
					</span>
					<span class="stem"></span>
					{#if hovered.pin === id}
						<Tooltip left={50} top={0}>
							{line.label}
							<data value={printAmount(p.amount)}>{formatAmount(printAmount(p.amount))}</data>
							{#if split}
								<small
									>about <data value={printAmount(p.interest)}
										>{formatAmount(printAmount(p.interest))}</data
									> interest</small
								>
							{/if}
							<time datetime={p.at.toString()}>{formatBucket[bucket](p.at.toString())}</time>
						</Tooltip>
					{/if}
				</span>
			{/each}
		{/each}
	</div>
	<div class="ticks" aria-hidden="true">
		{#each ticks as t (t.toString())}
			<time datetime={t.toString()} style:left="{leftOf(t, unit)}%"
				>{yearly ? formatBucket.year(t.toString()) : formatMonth(t.toString())}</time
			>
		{/each}
	</div>
</div>

<style>
	.chart {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		padding-inline: var(--size-3);
	}

	.plot {
		position: relative;
		height: calc(var(--size-3) * (var(--lanes) + 2) + var(--size-2));
		border-block-end: var(--size-line-0) solid var(--color-border);
	}

	.today {
		position: absolute;
		inset-block: 0;
		border-inline-start: var(--size-line-0) dashed var(--color-border);
	}

	.pin {
		position: absolute;
		pointer-events: none;
		inset-block-end: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: calc(var(--size-3) * var(--spread));
		min-width: var(--size-2);
		transform: translateX(-50%);
	}

	.circle {
		position: relative;
		min-width: var(--size-2);
		pointer-events: auto;
		z-index: 1;
		width: 100%;
		aspect-ratio: 1;
		background: var(--color-ink-2);
		border: var(--size-line-0) solid var(--color-ink-2);
		border-radius: 50%;
		opacity: 0.35;
	}

	.past .circle {
		opacity: 1;
	}

	.split {
		background: transparent;
	}

	.core {
		position: absolute;
		inset: 50% auto auto 50%;
		width: calc(100% * var(--share));
		aspect-ratio: 1;
		background: var(--color-ink-2);
		border-radius: 50%;
		transform: translate(-50%, -50%);
	}

	.pin:hover .core {
		background: var(--color-ink);
	}

	.stem {
		width: var(--size-line-0);
		height: calc(var(--size-3) * var(--lane) + var(--size-3));
		background: var(--color-border);
	}

	.stem::after {
		position: absolute;
		inset-block-end: 0;
		inset-inline-start: 50%;
		width: var(--size-0);
		aspect-ratio: 1;
		background: var(--color-ink);
		border-radius: 50%;
		content: '';
		transform: translate(-50%, 50%);
	}

	.pin:hover {
		z-index: 2;
	}

	.pin:hover .circle {
		background: var(--color-ink);
		border-color: var(--color-ink);
		opacity: 1;
	}

	.pin:hover .split {
		background: transparent;
	}

	.pin:hover .stem,
	.pin:hover .stem::after {
		background: var(--color-ink);
	}

	.ticks {
		position: relative;
		height: 1lh;
	}

	.ticks time {
		position: absolute;
		color: var(--color-muted);
		font: var(--text-data);
		transform: translateX(-50%);
	}
</style>
