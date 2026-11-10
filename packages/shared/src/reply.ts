import type { RupeaError } from './error';

/**
 * What a call that works through many things answers: those it did, and why the
 * rest did not.
 */
export type Batch<T> = { succeeded: T[]; failed: RupeaError[] };

// `ok` is false whenever errors rode along, even with `data` present.
export type Reply<T> = {
	ok: boolean;
	data: T | null;
	errors: RupeaError[];
};
