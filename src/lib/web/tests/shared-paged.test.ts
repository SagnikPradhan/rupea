import { describe, expect, it } from 'vitest';
import { paged } from '#lib/web/shared/paged.svelte.ts';

const page = (rows: string[], next: number | null) => ({
	ok: true,
	data: { rows, next },
	errors: [],
});

describe('a paged list', () => {
	it('grows a page at a time, and stops at its last', async () => {
		const list = paged(page(['a'], 1), (after) =>
			Promise.resolve(after === 1 ? page(['b'], 2) : page(['c'], null)),
		);

		await list.more();
		await list.more();
		await list.more();

		expect(list.rows).toEqual(['a', 'b', 'c']);
	});

	it('loads the page again after a fetch that failed', async () => {
		const answers = [
			() => Promise.reject(new Error('offline')),
			() => Promise.resolve(page(['b'], null)),
		];
		const list = paged(page(['a'], 1), () => answers.shift()!());

		await expect(list.more()).rejects.toThrow('offline');
		await list.more();

		expect(list.rows).toEqual(['a', 'b']);
	});
});
