import * as Accounts from '#services/ledger/application/accounts.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';

/**
 * What each account held at the end of a day, by commodity, as listBalances
 * reads it.
 */
export const heldOn = async (ledger: Ledger, day: Temporal.PlainDate) =>
	(
		(
			await Accounts.listBalances({
				ledger,
				from: day,
				to: day,
				bucket: 'date',
				accumulate: 'historical',
				measures: ['value', 'units', 'price', 'cost'],
			})
		)._unsafeUnwrap().succeeded[0]?.rows ?? []
	).map((r) => ({ ...r, value: r.value ?? 0n, units: r.units ?? 0n, cost: r.cost ?? 0n }));

/** What these accounts were worth in all, whatever they held. */
export const worthHeldOf = (r: { account: string; value: bigint }[], a: string) =>
	r.filter((x) => x.account === a).reduce((t, x) => t + x.value, 0n);

type WorthSpan = { from: Temporal.PlainDate; to: Temporal.PlainDate; account?: string | undefined };

/**
 * What the top accounts were worth at the end of each day of a span, as
 * listBalances reads it, and how many amounts had no price.
 */
export const worthDaysOf = async (ledger: Ledger, { from, to, account }: WorthSpan) => {
	const read = await Accounts.listBalances({
		ledger,
		from,
		to,
		account,
		bucket: 'date',
		accumulate: 'historical',
	});
	const rows = read._unsafeUnwrap().succeeded[0]?.rows ?? [];
	const tops = rows.filter((r) => r.account === 'Assets' || r.account === 'Liabilities');
	const days = [...new Set(tops.map((r) => r.bucket))].toSorted();

	return days.map((day) => {
		const own = tops.filter((r) => r.bucket === day);
		const assets = own.find((r) => r.account === 'Assets')?.value ?? 0n;
		const liabilities = own.find((r) => r.account === 'Liabilities')?.value ?? 0n;

		return {
			day,
			assets,
			liabilities,
			worth: assets + liabilities,
			unpriced: own.reduce((n, r) => n + r.unpriced, 0),
		};
	});
};
