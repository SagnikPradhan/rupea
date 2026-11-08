<script lang="ts">
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import type { Bucket } from '#lib/shared/dates.ts';
	import { formatAmount, formatBucket, formatMonth } from '#lib/web/shared/format.ts';

	type Props = {
		/** A line for each account, with a pin for each payment made or still due. */
		lines: {
			key: string;
			label: string;
			pins: { at: string; amount: number; past: boolean }[];
		}[];
		/** The first and last day of the axis, and the day the past ends. */
		from: string;
		to: string;
		today: string;
		/** What a pin's day stands for, a day, month or year. */
		bucket: Bucket;
		label: string;
	};

	const { lines, from, to, today, bucket, label }: Props = $props();

	const hovered = $state({ pin: null as string | null });

	const widest = $derived(Math.max(...lines.flatMap((l) => l.pins.map((p) => p.amount)), 0));
	const months = $derived(
		(Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
			Number(to.slice(5, 7)) -
			Number(from.slice(5, 7)),
	);
	const yearly = $derived(months > 14);
	const ticks = $derived(
		Array.from({ length: yearly ? Math.ceil(months / 12) + 1 : months + 2 }, (_, k) =>
			new Date(
				Date.UTC(
					Number(from.slice(0, 4)),
					(yearly ? 0 : Number(from.slice(5, 7)) - 1) + k * (yearly ? 12 : 1),
					1,
				),
			)
				.toISOString()
				.slice(0, 10),
		).filter((d) => d >= from && d <= to),
	);

	const leftOf = (d: string) =>
		Math.min(
			Math.max((Date.parse(d) - Date.parse(from)) / (Date.parse(to) - Date.parse(from)), 0),
			1,
		) * 100;
</script>

<div class="chart" style:--lanes={lines.length}>
	<div class="plot" role="list" aria-label={label}>
		<span class="today" style:left="{leftOf(today)}%"></span>
		{#each lines as line, lane (line.key)}
			{#each line.pins as p (`${p.at}${p.past}`)}
				{@const id = `${line.key}${p.at}${p.past}`}
				<span
					class={{ pin: true, past: p.past }}
					role="listitem"
					aria-label="{line.label}, {formatAmount(String(p.amount))}, {formatBucket[bucket](p.at)}"
					style:left="{leftOf(p.at)}%"
					style:--lane={lane}
					style:--spread={Math.sqrt(p.amount / widest)}
					onpointerenter={() => (hovered.pin = id)}
					onpointerleave={() => (hovered.pin = null)}
				>
					<span class="circle"></span>
					<span class="stem"></span>
					{#if hovered.pin === id}
						<Tooltip left={50} top={0}>
							{line.label}
							<data value={p.amount}>{formatAmount(String(p.amount))}</data>
							<time datetime={p.at}>{formatBucket[bucket](p.at)}</time>
						</Tooltip>
					{/if}
				</span>
			{/each}
		{/each}
	</div>
	<div class="ticks" aria-hidden="true">
		{#each ticks as t (t)}
			<time datetime={t} style:left="{leftOf(t)}%"
				>{yearly ? formatBucket.year(t) : formatMonth(t)}</time
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
		height: calc(var(--size-3) * (var(--lanes) + 1) + var(--size-2));
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

	.stem {
		width: var(--size-line-0);
		height: calc(var(--size-3) * var(--lane) + var(--size-1));
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
