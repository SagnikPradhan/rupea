import * as v from 'valibot';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { hrefWith } from '#lib/web/shared/links.ts';

/** Reads the page's URL query through a schema, and changes it by key. */
export const readQuery = <
	Schema extends v.GenericSchema<Record<string, string | undefined>, unknown>,
>(
	schema: Schema,
) => {
	const firsts = $derived(
		[...page.url.searchParams.keys()].map((k) => [k, page.url.searchParams.get(k)]),
	);
	const query = $derived(v.parse(schema, Object.fromEntries(firsts)));
	const href = (c: Partial<v.InferInput<Schema>>) => hrefWith(page.url.searchParams, c);

	return {
		get query() {
			return query;
		},
		href,
		go: (c: Partial<v.InferInput<Schema>>) => goto(href(c)),
	};
};
