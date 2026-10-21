import * as v from 'valibot';
import { Range } from './dates';

const Text = v.fallback(v.pipe(v.string(), v.trim()), '');

/** What a list of transactions or postings is narrowed to, as its page's URL carries it. */
export const Filter = v.object({
	range: v.fallback(Range, 'all'),
	account: Text,
	description: Text,
});

export type Filter = v.InferOutput<typeof Filter>;

/** An empty or unknown parameter leaves its side of the filter open. */
export const filterOf = (p: Iterable<[string, string]>): Filter =>
	v.parse(Filter, Object.fromEntries(p));
