import { nameOf } from './accounts';
import { OWED, owedOf, PARTS, seriesOf } from './chart';
import { OTHER } from './spending';

export const OTHER_OWED = 'Other owed';

type Worth = { parts: Record<string, string> };

/** An area of the chart, the parts it adds up, and its colour token. */
export type Area = { key: string; label: string; parts: string[]; shade: string };

/** The parts that get an area of their own: the largest held, then the largest owed, by what they were worth on the last day; the rest of each side is folded into one. */
export const areasOf = (worth: Worth[]) => {
	const last = worth.at(-1)?.parts ?? {};
	const names = [...new Set(worth.flatMap((w) => Object.keys(w.parts)))].toSorted(
		(a, b) => Math.abs(Number(last[b] ?? 0)) - Math.abs(Number(last[a] ?? 0)),
	);
	const owed = names.filter((n) => worth.reduce((t, w) => t + Number(w.parts[n] ?? 0), 0) < 0);
	const held = names.filter((n) => !owed.includes(n));

	return [
		...sideOf(held, { most: PARTS, rest: OTHER, shade: seriesOf }),
		...sideOf(owed, { most: OWED, rest: OTHER_OWED, shade: owedOf }),
	];
};

/** Each row with what every area was worth that day, the folded parts added up. */
export const withAreas = <Row extends Worth>(worth: Row[], areas: Area[]) =>
	worth.map((w) => ({
		...w,
		...Object.fromEntries(
			areas.map((a) => [a.key, String(a.parts.reduce((t, p) => t + Number(w.parts[p] ?? 0), 0))]),
		),
	}));

type Side = { most: number; rest: string; shade: (k: number) => string };

const sideOf = (names: string[], { most, rest, shade }: Side): Area[] => {
	const own = names.length > most ? names.slice(0, most - 1) : names;
	const folded = names.slice(own.length);
	const areas = own.map((n, k) => ({ key: n, label: nameOf(n), parts: [n], shade: shade(k) }));

	return folded.length > 0
		? [...areas, { key: rest, label: rest, parts: folded, shade: shade(own.length) }]
		: areas;
};
