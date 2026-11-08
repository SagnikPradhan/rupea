<script lang="ts">
	import { formatAmount, formatBucket } from '#lib/web/shared/format.ts';

	type Props = {
		/** The payments in the order of their days, each drawn as a pin. */
		dues: { key: string; label: string; amount: number; due: string }[];
		label: string;
	};

	const { dues, label }: Props = $props();

	const widest = $derived(Math.max(...dues.map((d) => d.amount), 0));
</script>

<ol aria-label={label}>
	{#each dues as d (d.key)}
		<li style:--spread={Math.sqrt(d.amount / widest)}>
			<span class="name">{d.label}</span>
			<data value={d.amount}>{formatAmount(String(d.amount))}</data>
			<span class="bubble"><span class="circle"></span></span>
			<span class="stem"></span>
			<span class="axis"></span>
			<time datetime={d.due}>{formatBucket.day(d.due)}</time>
		</li>
	{/each}
</ol>

<style>
	ol {
		display: flex;
		margin: 0;
		padding: 0;
		overflow-x: auto;
		list-style: none;
	}

	li {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		min-width: calc(var(--size-5) * 1.25);
	}

	.name {
		max-width: 100%;
		overflow: hidden;
		font: var(--text-base);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	data,
	time {
		color: var(--color-muted);
		font: var(--text-data);
	}

	.bubble {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		height: var(--size-5);
		margin-block-start: var(--size-1);
	}

	.circle {
		width: calc(var(--size-5) * var(--spread));
		aspect-ratio: 1;
		background: var(--color-ink-2);
		border-radius: 50%;
	}

	.stem {
		width: var(--size-line-0);
		height: var(--size-3);
		background: var(--color-ink);
	}

	.axis {
		position: relative;
		width: 100%;
		height: var(--size-line-0);
		background: var(--color-border);
	}

	.axis::after {
		position: absolute;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		width: var(--size-0);
		aspect-ratio: 1;
		background: var(--color-ink);
		border-radius: 50%;
		content: '';
		transform: translate(-50%, -50%);
	}

	time {
		margin-block-start: var(--size-1);
	}
</style>
