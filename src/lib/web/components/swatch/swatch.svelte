<script lang="ts">
	import { colorOf, fillOf } from '#lib/web/chart.ts';

	/** Which part of a stacked bar this stands for, filled at that part's density. */
	const { part }: { part: number } = $props();

	const paint = (canvas: HTMLCanvasElement) => {
		const index = part;
		const dark = matchMedia('(prefers-color-scheme: dark)');

		const draw = () => {
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			canvas.width = canvas.clientWidth * devicePixelRatio;
			canvas.height = canvas.clientHeight * devicePixelRatio;
			ctx.fillStyle = fillOf(ctx, index, colorOf(canvas.parentElement ?? canvas, '--color-ink'));
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		};

		draw();
		dark.addEventListener('change', draw);
		return () => dark.removeEventListener('change', draw);
	};
</script>

<canvas aria-hidden="true" {@attach paint}></canvas>

<style>
	canvas {
		width: var(--size-2);
		height: var(--size-2);
		margin-right: var(--size-0);
		vertical-align: middle;
	}
</style>
