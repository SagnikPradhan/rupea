import { fault, RupeaError, unknownError } from '@rupea/shared/error.ts';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

describe('the error schema', () => {
	it('reads the errors the code makes', () => {
		const errors = [
			fault('AuthInvalidCode'),
			fault('LedgerNotFound', { handle: 'ada' }),
			fault('StorageConflict', { key: 'a', expected: null, actual: 'b' }),
			fault('FeedUnavailable', { feed: 'f', symbol: 's' }),
			unknownError(new Error('boom')),
		];

		expect(errors.map((e) => v.is(RupeaError, e))).toEqual(errors.map(() => true));
	});

	it('reads the errors that carry a cause, however deep', () => {
		const inner = fault('CannotReadFile', { path: 'a', reason: 'gone' });
		const outer = fault('CannotReadDirectory', { path: 'd', cause: [inner] });

		expect(v.is(RupeaError, { ...outer, cause: [{ ...inner, cause: [outer] }] })).toBe(true);
		expect(v.is(RupeaError, { ...outer, cause: [{ type: 'Bogus' }] })).toBe(false);
	});

	it('keeps every field of the errors typed by hand, a cause among them', () => {
		const cause = [fault('AuthInvalidCode')];
		const caused = [
			{ type: 'CannotReadDirectory', path: 'd', cause },
			{ type: 'CannotReadFile', path: 'f', reason: 'gone', cause },
			{ type: 'ExtractionMissingModel', path: 'm', cause },
			{ type: 'ModelDownloadFailed', url: 'u', status: 503, cause },
		] satisfies RupeaError[];

		expect(caused.map((e) => v.parse(RupeaError, e))).toEqual(caused);
	});

	it('refuses a type it does not know and a field of the wrong kind', () => {
		expect(v.is(RupeaError, { type: 'Bogus' })).toBe(false);
		expect(v.is(RupeaError, { type: 'LedgerNotFound', handle: 7 })).toBe(false);
		expect(v.is(RupeaError, { type: 'LedgerNotFound' })).toBe(false);
	});
});
