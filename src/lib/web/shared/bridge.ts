import { nameOf } from './accounts';

type Moved = {
	start: string;
	income: string;
	expenses: string;
	shifts: { account: string; amount: string }[];
	other: string;
	end: string;
};

/** A bar of the bridge: a total stands from the bottom, a step runs from where the one before it ended. */
export type Step = {
	key: string;
	label: string;
	kind: 'total' | 'step';
	from: number;
	to: number;
};

/** How many groups are named before the rest are folded into one bar. */
const NAMED = 4;

/** Net worth at the start, income, expenses, the four groups prices moved most, everything else, and net worth at the end. */
export const stepsOf = (b: Moved): Step[] => {
	const shifts = b.shifts
		.map((s) => ({ key: s.account, label: nameOf(s.account), amount: Number(s.amount) }))
		.toSorted((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
	const rest = shifts.slice(NAMED).reduce((t, s) => t + s.amount, Number(b.other));
	const changes = [
		{ key: 'income', label: 'Income', amount: Number(b.income) },
		{ key: 'expenses', label: 'Expenses', amount: -Number(b.expenses) },
		...shifts.slice(0, NAMED),
		...(rest === 0 ? [] : [{ key: 'other', label: 'Other', amount: rest }]),
	];
	const start = Number(b.start);

	return [
		{ key: 'start', label: 'Start', kind: 'total', from: 0, to: start },
		...changes.map((c, i) => {
			const before = start + changes.slice(0, i).reduce((t, x) => t + x.amount, 0);
			return {
				key: c.key,
				label: c.label,
				kind: 'step' as const,
				from: before,
				to: before + c.amount,
			};
		}),
		{ key: 'end', label: 'End', kind: 'total', from: 0, to: Number(b.end) },
	];
};
