import { inWindows } from '#lib/server/shared/iterables.ts';
import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';

async function* timed(items: [number, string][]) {
	for (const [wait, item] of items) {
		await setTimeout(wait);
		yield item;
	}
}

const collect = async <T>(items: AsyncIterable<T>) => {
	const all: T[] = [];
	for await (const i of items) all.push(i);
	return all;
};

describe('grouping into windows', () => {
	it('groups what arrives within a window of its first item', async () => {
		const items = timed([
			[0, 'a'],
			[5, 'b'],
			[100, 'c'],
			[5, 'd'],
		]);
		expect(await collect(inWindows(items, 50))).toEqual([
			['a', 'b'],
			['c', 'd'],
		]);
	});

	it('yields what is left when the items end mid-window', async () => {
		expect(await collect(inWindows(timed([[0, 'a']]), 1000))).toEqual([['a']]);
	});

	it('yields nothing for no items', async () => {
		expect(await collect(inWindows(timed([]), 10))).toEqual([]);
	});
});
