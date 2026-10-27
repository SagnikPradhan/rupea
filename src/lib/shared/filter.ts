import * as v from 'valibot';
import { Period, periodOf } from './dates';

const Text = v.fallback(v.pipe(v.string(), v.trim()), '');

/** What a list of transactions or postings is narrowed to, as its page's URL carries it. */
export const Filter = v.object({
	period: Period,
	account: Text,
	description: Text,
});

export type Filter = v.InferOutput<typeof Filter>;

/** An empty or unknown parameter leaves its side of the filter open, and all of history is listed unless a period is picked. */
export const filterOf = (params: { get: (key: string) => string | null }): Filter =>
	v.parse(Filter, {
		period: periodOf(params, { kind: 'all' }),
		account: params.get('account'),
		description: params.get('description'),
	});
