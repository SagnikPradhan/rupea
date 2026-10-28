import { setTimeout } from 'node:timers/promises';

const CLOSED = Symbol('closed');

/** Groups what `items` yields into one array for each `ms` after a group's first item. */
export async function* inWindows<T>(items: AsyncIterable<T>, ms: number): AsyncIterable<T[]> {
	const iterator = items[Symbol.asyncIterator]();
	const pending = { next: iterator.next() };
	const closing: Promise<typeof CLOSED>[] = [];
	const window: T[] = [];

	while (true) {
		const item = await Promise.race([pending.next, ...closing]);
		if (item === CLOSED) {
			closing.length = 0;
			yield window.splice(0);
			continue;
		}
		if (item.done) break;

		pending.next = iterator.next();
		if (window.length === 0) closing.push(setTimeout(ms, CLOSED, { ref: false }));
		window.push(item.value);
	}

	if (window.length > 0) yield window;
}
