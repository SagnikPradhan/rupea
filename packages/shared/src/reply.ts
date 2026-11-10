import type { RupeaError } from './error';

// `ok` is false whenever errors rode along, even with `data` present.
export type Reply<T> = {
	ok: boolean;
	data: T | null;
	errors: RupeaError[];
};
