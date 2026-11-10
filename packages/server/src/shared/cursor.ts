/** Items read front to back; reading moves at forward and never removes an item. */
export type Cursor<T> = { items: T[]; at: number };

export const cursorOf = <T>(l: T[]): Cursor<T> => ({ items: l, at: 0 });

/** Yields the next item and moves past it first, so the loop body can take more. */
export function* drain<T>(c: Cursor<T>): Generator<T> {
	while (c.at < c.items.length) yield c.items[c.at++]!;
}

/** Takes the items from here on that keep accepts. */
export const takeWhile = <T>(c: Cursor<T>, keep: (item: T) => boolean): T[] => {
	const start = c.at;
	while (c.at < c.items.length && keep(c.items[c.at]!)) c.at++;
	return c.items.slice(start, c.at);
};

/** Moves back over the last n items taken, so they are read again. */
export const putBack = <T>(c: Cursor<T>, n: number) => {
	c.at -= n;
};
