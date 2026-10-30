type MemoOptions<A, R> = { fn: (a: A) => R; size: number };

/** Keeps fn's results by its argument as JSON, and starts afresh once it holds size of them. */
export const memo = <A, R>({ fn, size }: MemoOptions<A, R>) => {
	const seen = new Map<string, R>();

	return (a: A): R => {
		const key = JSON.stringify(a);
		if (seen.has(key)) return seen.get(key)!;

		if (seen.size >= size) seen.clear();
		const result = fn(a);
		seen.set(key, result);
		return result;
	};
};
