import type { RupeeError } from '#lib/server/shared/result/error.ts';
import type { Reply } from '#lib/server/shared/result/reply.ts';

type Page<T, C> = { rows: T[]; next: C | null };

/** A list that grows a page at a time, and stops at its last page or its first failure. */
export type Paged<T> = {
	readonly rows: T[];
	readonly errors: RupeeError[];
	more: () => Promise<void>;
};

export const paged = <T, C>(
	first: Reply<Page<T, C>>,
	fetch: (after: C) => Promise<Reply<Page<T, C>>>,
): Paged<T> => {
	const list = $state({
		rows: first.data?.rows ?? [],
		next: first.data?.next ?? null,
		errors: first.errors,
		busy: false,
	});

	return {
		get rows() {
			return list.rows;
		},
		get errors() {
			return list.errors;
		},
		async more() {
			const after = list.next;
			if (after === null || list.busy) return;

			list.busy = true;
			const page = await fetch(after).finally(() => (list.busy = false));
			list.rows.push(...(page.data?.rows ?? []));
			Object.assign(list, { next: page.data?.next ?? null, errors: page.errors });
		},
	};
};
