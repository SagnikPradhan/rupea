import { nameOf } from './accounts';
import { OTHER, OTHER_OWED, OWED, owedOf, PARTS, seriesOf } from './chart';
import { sumOf } from './numbers';

/** What one part was worth on a day: an account, or one commodity it holds. */
type Part = { account: string; commodity: string | null; amount: string };

type Worth = { parts: Part[] };

/** An area of the chart, the parts it adds up, and its colour token. */
export type Area = { key: string; label: string; parts: string[]; shade: string };

/** The parts that get an area of their own: the largest held, then the largest owed, by what they were worth on the last day; the rest of each side is folded into one. */
export const areasOf = (worth: Worth[]) => {
	const totals = totalsOf(worth.flatMap((w) => w.parts));
	const labels = Object.fromEntries(Object.entries(totals).map(([k, t]) => [k, t.label]));
	const last = amountsOf(worth.at(-1));

	const keys = Object.keys(totals).toSorted(
		(a, b) => Math.abs(last[b] ?? 0) - Math.abs(last[a] ?? 0),
	);
	const owes = (k: string) => (totals[k]?.amount ?? 0) < 0;
	const owed = keys.filter(owes);
	const held = keys.filter((k) => !owes(k));

	return [
		...sideOf(held, { labels, most: PARTS, rest: OTHER, shade: seriesOf }),
		...sideOf(owed, { labels, most: OWED, rest: OTHER_OWED, shade: owedOf }),
	];
};

/** Each row with what every area was worth that day, the folded parts added up. */
export const withAreas = <Row extends Worth>(worth: Row[], areas: Area[]) =>
	worth.map((w) => {
		const amounts = amountsOf(w);
		return {
			...w,
			...Object.fromEntries(
				areas.map((a) => [a.key, String(sumOf(a.parts.map((p) => amounts[p] ?? 0)))]),
			),
		};
	});

type Side = {
	labels: Record<string, string>;
	most: number;
	rest: string;
	shade: (k: number) => string;
};

const sideOf = (keys: string[], { labels, most, rest, shade }: Side): Area[] => {
	const own = keys.length > most ? keys.slice(0, most - 1) : keys;
	const folded = keys.slice(own.length);
	const areas = own.map((k, i) => ({ key: k, label: labels[k] ?? k, parts: [k], shade: shade(i) }));

	return folded.length > 0
		? [...areas, { key: rest, label: rest, parts: folded, shade: shade(own.length) }]
		: areas;
};

/** A part of a commodity is told apart from its account's, so both can have an area. */
const keyOf = (p: Part) => (p.commodity === null ? p.account : `${p.account} ${p.commodity}`);

const labelOf = (p: Part) => p.commodity ?? nameOf(p.account);

/** Each part's label and what it adds up to over every day, in one pass. */
const totalsOf = (parts: Part[]) => {
	const totals: Record<string, { label: string; amount: number }> = {};
	for (const p of parts) {
		const total = (totals[keyOf(p)] ??= { label: labelOf(p), amount: 0 });
		total.amount += Number(p.amount);
	}
	return totals;
};

const amountsOf = (w: Worth | undefined) =>
	Object.fromEntries((w?.parts ?? []).map((p) => [keyOf(p), Number(p.amount)]));
