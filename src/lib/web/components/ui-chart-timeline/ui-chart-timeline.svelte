<script lang="ts">
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
		label: string;
	};

	const { lines, from, to, today, label }: Props = $props();

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

<div class="chart" role="list" aria-label={label} style:--today="{leftOf(today)}%">
	{#each lines as line (line.key)}
		<div class="line" role="listitem">
			<span class="name">{line.label}</span>
			<div class="track">
				{#each line.pins as p (p.at)}
					<data
						class={{ pin: true, past: p.past }}
						style:left="{leftOf(p.at)}%"
						style:--spread={Math.sqrt(p.amount / widest)}
						value={p.amount}
						title="{line.label} · {formatAmount(String(p.amount))} · {formatBucket.day(p.at)}"
					></data>
				{/each}
			</div>
		</div>
	{/each}
	<div class="line">
		<span></span>
		<div class="ticks" aria-hidden="true">
			{#each ticks as t (t)}
				<time datetime={t} style:left="{leftOf(t)}%"
					>{yearly ? formatBucket.year(t) : formatMonth(t)}</time
				>
			{/each}
		</div>
	</div>
</div>

<style>
	.chart {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	.line {
		display: grid;
		grid-template-columns: calc(var(--size-5) * 2) 1fr;
		align-items: center;
		gap: var(--size-2);
	}

	.name {
		overflow: hidden;
		font: var(--text-base);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track {
		position: relative;
		height: var(--size-4);
		border-block-end: var(--size-line-0) solid var(--color-border);
	}

	.track::before {
		position: absolute;
		inset-block: 0;
		inset-inline-start: var(--today);
		border-inline-start: var(--size-line-0) dashed var(--color-border);
		content: '';
	}

	.pin {
		position: absolute;
		inset-block-start: 50%;
		width: calc(var(--size-3) * var(--spread));
		min-width: var(--size-1);
		aspect-ratio: 1;
		border: var(--size-line-0) solid var(--color-ink-2);
		border-radius: 50%;
		transform: translate(-50%, -50%);
	}

	.past {
		background: var(--color-ink-2);
	}

	.ticks {
		position: relative;
		height: 1lh;
	}

	time {
		position: absolute;
		color: var(--color-muted);
		font: var(--text-data);
		transform: translateX(-50%);
	}
</style>
