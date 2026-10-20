/** Yields the front item and removes it first, so the loop body can take more from the stack. */
export function* drain<T>(l: T[]): Generator<T> {
	while (l.length > 0) yield* l.splice(0, 1);
}

/** Removes and returns the leading items that keep accepts. */
export const takeWhile = <T>(stack: T[], keep: (item: T) => boolean): T[] => {
	const end = stack.findIndex((i) => !keep(i));
	return stack.splice(0, end < 0 ? stack.length : end);
};
