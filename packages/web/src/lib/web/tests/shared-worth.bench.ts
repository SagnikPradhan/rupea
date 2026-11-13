import { area, type SeriesPoint } from 'd3-shape';
import { it } from 'vitest';
import { stackOf } from '#lib/web/shared/chart.ts';
import { areasOf, withAreas } from '#lib/web/shared/worth.ts';

const DAYS = 20 * 365;
const PARTS = 40;

const worth = Array.from({ length: DAYS }, (_, d) => ({
	day: Temporal.PlainDate.from('2006-01-01').add({ days: d }).toString(),
	parts: Array.from({ length: PARTS }, (_, p) => ({
		account: `Assets:Account${p}`,
		commodity: null,
		amount: String((p % 5 === 0 ? -1 : 1) * (1000 + p * d)),
	})),
}));
const areas = areasOf(worth);
const keys = areas.map((a) => a.key);
const rows = withAreas(worth, areas);
const piles = stackOf(rows, keys);

const pile = area<SeriesPoint<Record<string, unknown>>>()
	.x((_, i) => i)
	.y0(([from]) => from)
	.y1(([, to]) => to);

it(
	`shapes net worth over ${DAYS} days of ${PARTS} parts`,
	{ timeout: 600_000 },
	async ({ bench }) => {
		await bench.compare(
			bench('areasOf', () => areasOf(worth)),
			bench('withAreas', () => withAreas(worth, areas)),
			bench('stackOf', () => stackOf(rows, keys)),
			bench('area paths', () => piles.map((p) => pile(p))),
		);
	},
);
