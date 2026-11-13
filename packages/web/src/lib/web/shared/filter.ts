import * as v from 'valibot';
import { Period } from '@rupea/shared/dates.ts';

const Text = v.fallback(v.pipe(v.string(), v.trim()), '');

/**
 * What a list of transactions or postings is narrowed to, as its page's URL
 * carries it.
 */
export const Filter = v.object({
	period: Period,
	account: Text,
	description: Text,
});

export type Filter = v.InferOutput<typeof Filter>;

/**
 * An empty or unknown parameter leaves its side of the filter open, and all of
 * history is listed unless a period is picked.
 */
export const filterOf = (params: { get: (key: string) => string | null }): Filter =>
	v.parse(Filter, {
		period: periodOf(params, { kind: 'all' }),
		account: params.get('account'),
		description: params.get('description'),
	});

/** The names of the URL parameters that pick a period. */
export const PERIOD_PARAMS = ['at', 'range', 'from', 'to'] as const;

/**
 * The period a URL picks with at, range=all, or from and to; the fallback when
 * it picks none.
 */
export const periodOf = (
	params: { get: (key: string) => string | null },
	fallback: Period,
): Period => {
	const at = params.get('at');
	const picked = [
		{ kind: 'month', at },
		{ kind: 'year', at },
		{ kind: params.get('range') },
		{ kind: 'custom', from: params.get('from'), to: params.get('to') },
	].find((p) => v.is(Period, p));

	return picked ?? fallback;
};

/** The period picked by parsed query fields, as periodOf reads a URL. */
export const periodIn = (f: Record<string, string | undefined>, p: Period): Period =>
	periodOf({ get: (k) => f[k] ?? null }, p);

/** The URL parameters that pick a period, as periodOf reads them. */
export const paramsOf = (period: Period): Record<string, string> => {
	if (period.kind === 'all') return { range: 'all' };
	if (period.kind === 'custom') return { from: period.from, to: period.to };

	return { at: period.at };
};
