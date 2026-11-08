<script lang="ts">
	import Axes from '#lib/web/components/ui-chart-axes/ui-chart-axes.svelte';
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import { labelsIn, VIEW } from '#lib/web/shared/chart.ts';
	import { formatAmount, formatBucket } from '#lib/web/shared/format.ts';
	import type { Bucket } from '#lib/shared/dates.ts';

	type Circle = { bucket: string; paid: number };

	type Props = {
		lines: { key: string; label: string; circles: Circle[] }[];
		buckets: string[];
		bucket: Bucket;
		label: string;
	};

	const { lines, buckets, bucket, label }: Props = $props();

	const hovered = $state({ key: null as string | null, bucket: null as string | null });
	const measured = $state({ rect: undefined as DOMRectReadOnly | undefined });

	const widest = $derived(Math.max(...lines.flatMap((l) => l.circles.map((c) => c.paid)), 0));
	const step = $derived(Math.ceil(buckets.length / labelsIn(measured.rect?.width ?? 0, 'across')));
	const across = $derived(
		buckets.flatMap((b, i) =>
			i % step === 0 ? [{ at: leftOf(i), label: formatBucket[bucket](b) }] : [],
		),
	);
	const under = $derived(
		lines.flatMap((l, row) =>
			l.circles.flatMap((c) =>
				c.bucket === hovered.bucket && l.key === hovered.key
					? [{ line: l, circle: c, top: ((row + 0.5) / lines.length) * VIEW }]
					: [],
			),
		)[0],
	);

	function leftOf(i: number) {
		return ((i + 0.5) / buckets.length) * VIEW;
	}
</script>

<figure>
	<div class="chart">
		<ul>
			{#each lines as line (line.key)}
				<li>{line.label}</li>
			{/each}
		</ul>
		<div class="plot">
			<div
				class="area"
				role="img"
				aria-label={label}
				style:--count={buckets.length}
				bind:contentRect={measured.rect}
			>
				{#each lines as line (line.key)}
					<div class="track">
						{#each line.circles as c (c.bucket)}
							{@const at = buckets.indexOf(c.bucket)}
							{#if at >= 0}
								<span
									class="circle"
									class:faded={hovered.key !== null &&
										(hovered.key !== line.key || hovered.bucket !== c.bucket)}
									role="presentation"
									style:left="{leftOf(at)}%"
									style:--spread={Math.sqrt(c.paid / widest)}
									onpointerenter={() => {
										hovered.key = line.key;
										hovered.bucket = c.bucket;
									}}
									onpointerleave={() => {
										hovered.key = null;
										hovered.bucket = null;
									}}
								></span>
							{/if}
						{/each}
					</div>
				{/each}
				<Axes {across} up={[]} />
				{#if under}
					<Tooltip left={leftOf(buckets.indexOf(under.circle.bucket))} top={under.top}>
						{under.line.label}
						<data>{formatAmount(String(under.circle.paid))}</data>
						{formatBucket[bucket](under.circle.bucket)}
					</Tooltip>
				{/if}
			</div>
		</div>
	</div>
</figure>

<style>
	.chart {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--size-2);
	}

	ul {
		display: grid;
		grid-auto-rows: var(--size-4);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--text-label);
	}

	li {
		display: flex;
		align-items: center;
	}

	.plot {
		position: relative;
		padding-bottom: var(--size-3);
	}

	.area {
		position: relative;
	}

	.track {
		position: relative;
		height: var(--size-4);
		border-bottom: var(--size-line-0) solid var(--color-border);
	}

	.circle {
		position: absolute;
		top: 50%;
		width: calc(var(--size-2) + var(--spread) * var(--size-3));
		max-width: calc(100% / var(--count));
		aspect-ratio: 1;
		background: var(--color-muted);
		border-radius: 50%;
		opacity: 0.85;
		transform: translate(-50%, -50%);
	}

	.faded {
		opacity: 0.2;
	}

	data {
		font-family: var(--font-mono);
	}
</style>
