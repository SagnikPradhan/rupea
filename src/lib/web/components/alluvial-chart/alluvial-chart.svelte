<script lang="ts">
	import {
		edgeAt,
		flowsOf,
		layoutOf,
		NODE,
		nodeAt,
		type Band,
		type Node,
	} from '#lib/web/shared/alluvial.ts';
	import { colorOf, paintInto, seriesOf } from '#lib/web/shared/chart.ts';
	import { formatAmount } from '#lib/web/shared/format.ts';
	import type { Snippet } from 'svelte';

	type Props = {
		/** An account and every account under it, with what each spent and the account the server draws it under. */
		rows: { account: string; parent: string | null; amount: string }[];
		/** The account everything flows from. */
		account: string;
		/** The accounts right under it with a shade of their own, as the bars have them. */
		parts: string[];
		label: string;
		/** Drawn above the plot, as nothing is singled out by the cursor. */
		summary?: Snippet<[number | null]>;
		/** Drawn below the plot, such as a choice of chart. */
		controls?: Snippet;
	};

	const { rows, account, parts, label, summary, controls }: Props = $props();

	const FADED = 0.2;
	const BAND = 0.4;
	/** A name is written beside a bar only when the bar is at least this tall. */
	const NAMED = 12;
	const STEPS = 24;

	const hovered = $state({ node: null as Node | null, left: 0, top: 0 });
	/** The part of the bar under the cursor, or undefined while there is none. */
	const lit = $derived(hovered.node?.part);
	const laid = { nodes: [] as Node[], bands: [] as Band[] };

	/** Reads the flows and the part lit before painting, so the chart is painted again when either changes. */
	const chart = (node: HTMLElement) => {
		const flows = flowsOf({ rows, account, parts });
		const part = lit;
		return paintInto(node, (ctx, font) => {
			Object.assign(laid, layoutOf(flows, { width: node.clientWidth, height: node.clientHeight }));
			paint(ctx, { node, font, lit: part });
		});
	};

	/** Finds the bar under the cursor, or the one its band runs into, fading the other parts while it is there. */
	const point = (e: PointerEvent) =>
		Object.assign(hovered, {
			node: nodeAt(laid, e.offsetX, e.offsetY) ?? null,
			left: e.offsetX,
			top: e.offsetY,
		});

	const leave = () => (hovered.node = null);

	const paint = (
		ctx: CanvasRenderingContext2D,
		{ node, font, lit }: { node: HTMLElement; font: string; lit: number | null | undefined },
	) => {
		const muted = colorOf(node, '--color-muted');
		const ink = colorOf(node, '--color-ink');
		const fillOf = (part: number | null) => (part === null ? muted : colorOf(node, seriesOf(part)));
		const alphaOf = (part: number | null) =>
			lit === undefined || part === null || part === lit ? 1 : FADED;

		laid.bands.forEach((b) => {
			ctx.globalAlpha = BAND * alphaOf(b.part);
			ctx.fillStyle = fillOf(b.part);
			ctx.fill(bandPath(b));
		});
		laid.nodes.forEach((n) => {
			ctx.globalAlpha = alphaOf(n.part);
			ctx.fillStyle = fillOf(n.part);
			ctx.fillRect(n.x, n.y, NODE, n.height);
		});

		ctx.globalAlpha = 1;
		ctx.font = font;
		ctx.textBaseline = 'middle';
		ctx.fillStyle = ink;
		laid.nodes.filter((n) => n.column > 0 && n.height >= NAMED).forEach((n) => name(ctx, n));
	};

	/** Writes a bar's name beside it, inside the chart: after the middle column, before the last. */
	const name = (ctx: CanvasRenderingContext2D, n: Node) => {
		const last = n.column === 2;
		ctx.textAlign = last ? 'right' : 'left';
		ctx.fillText(n.label, last ? n.x - NODE / 2 : n.x + NODE * 1.5, n.y + n.height / 2);
	};

	/** A band's outline, along its top edge and back along its bottom one. */
	const bandPath = (b: Band) => {
		const xs = Array.from({ length: STEPS + 1 }, (_, i) => b.x0 + ((b.x1 - b.x0) * i) / STEPS);
		const path = new Path2D();
		xs.forEach((x) => path.lineTo(x, edgeAt(b, x)));
		xs.toReversed().forEach((x) => path.lineTo(x, edgeAt(b, x) + b.height));
		path.closePath();
		return path;
	};
</script>

<figure>
	{@render summary?.(null)}
	<div
		class="plot"
		role="img"
		aria-label={label}
		onpointermove={point}
		onpointerleave={leave}
		{@attach chart}
	>
		{#if hovered.node}
			<p class="tip" style:left="{hovered.left}px" style:top="{hovered.top}px">
				{hovered.node.label}
				<data>{formatAmount(String(hovered.node.amount))}</data>
			</p>
		{/if}
	</div>
	{#if controls}<figcaption>{@render controls()}</figcaption>{/if}
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--gap-label);
		margin: 0;
	}

	figcaption {
		display: flex;
		justify-content: flex-end;
	}

	.plot {
		position: relative;
		height: var(--plot-short);
		touch-action: pan-y;
	}

	.plot :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.tip {
		position: absolute;
		z-index: 1;
		display: flex;
		gap: var(--gap-label);
		margin: 0;
		padding: var(--gap-tight) var(--gap-label);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		color: var(--color-ink);
		font-size: var(--text-small);
		white-space: nowrap;
		pointer-events: none;
		transform: translate(-50%, calc(-100% - var(--gap-label)));
	}

	data {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
</style>
