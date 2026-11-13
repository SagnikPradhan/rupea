import { describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { readQuery } from '#lib/web/shared/query.svelte.ts';

vi.mock('$app/state', () => ({ page: { url: new URL('https://rupee.test/') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const Schema = v.object({
	range: v.fallback(v.picklist(['1y', '5y']), '1y'),
	account: v.optional(v.string()),
});

const at = (search: string) => (page.url = new URL(`https://rupee.test/${search}`));

describe('readQuery', () => {
	it('parses a valid query', () => {
		at('?range=5y&account=Assets');
		expect(readQuery(Schema).query).toEqual({ range: '5y', account: 'Assets' });
	});

	it('reads the first value of a repeated key', () => {
		at('?account=A&account=B');
		expect(readQuery(Schema).query).toEqual({ range: '1y', account: 'A' });
	});

	it('falls back on an invalid value', () => {
		at('?range=9y');
		expect(readQuery(Schema).query).toEqual({ range: '1y' });
	});

	it('works with a schema that transforms', () => {
		const Count = v.pipe(
			v.object({ n: v.fallback(v.string(), '0') }),
			v.transform((q) => ({ n: Number(q.n) })),
		);
		at('?n=7');
		expect(readQuery(Count).query).toEqual({ n: 7 });
	});

	it('changes one key and keeps the rest', () => {
		at('?range=5y&account=Assets');
		expect(readQuery(Schema).href({ range: '1y' })).toBe('?range=1y&account=Assets');
	});

	it('drops a key set to undefined', () => {
		at('?range=5y&account=Assets');
		expect(readQuery(Schema).href({ account: undefined })).toBe('?range=5y');
	});

	it('goes to the changed href', () => {
		at('?range=5y');
		readQuery(Schema).go({ account: 'Assets' });
		expect(goto).toHaveBeenCalledWith('?range=5y&account=Assets');
	});

	it('passes an unknown key and an invalid value through at runtime', () => {
		const query = readQuery(Schema);
		at('');
		// @ts-expect-error nope
		expect(query.href({ nope: 'x' })).toBe('?nope=x');
		// @ts-expect-error range
		expect(query.href({ range: '9y' })).toBe('?range=9y');
	});
});
