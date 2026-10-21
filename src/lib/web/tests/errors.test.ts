import { describe, expect, it } from 'vitest';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { explain, isWarning, placesOf } from '#lib/web/errors.ts';

const at = 'a.rupee:4';

describe('explain', () => {
	it.each<[RupeeError, string]>([
		[
			fault('ParseInvalidTransactionHeader', { location: at }),
			'This line should start a transaction with a date and a description.',
		],
		[fault('ParseMissingTransactionBody', { location: at }), 'This transaction has no postings.'],
		[fault('ParseInvalidPosting', { location: at }), 'This posting can’t be read.'],
		[
			fault('ParseInvalidAccount', { location: at, account: 'bad' }),
			'“bad” isn’t a valid account name.',
		],
		[
			fault('ParseUnbalancedTransaction', { location: at, residual: '20 INR' }),
			'This transaction is off by 20 INR.',
		],
		[
			fault('ParseMultipleImplicitPostings', { location: at }),
			'Only one posting can leave out its amount.',
		],
		[fault('ParseInvalidMetadata', { location: at }), 'This metadata line can’t be read.'],
		[
			fault('ParseDetachedMetadata', { location: at }),
			'This metadata line isn’t under a transaction.',
		],
		[
			fault('EventInvalidMembership', { location: at }),
			'This transaction belongs to more than one event.',
		],
		[
			fault('EventStale', { location: at }),
			'This event changed since it was read. Reload and try again.',
		],
		[
			fault('EventWithoutPrimary', { event: 'rent', location: at }),
			'Event rent has no primary transaction.',
		],
		[
			fault('EventWithManyPrimaries', { event: 'rent', location: at }),
			'Event rent has more than one primary transaction.',
		],
		[
			fault('EventDisagreement', {
				event: 'rent',
				location: at,
				account: 'Assets:Bank',
				expected: '-100',
				actual: '-90',
			}),
			'Event rent disagrees on Assets:Bank: expected -100, got -90.',
		],
		[
			fault('BalanceAssertionFailed', {
				location: at,
				account: 'Assets:Bank',
				expected: '100',
				actual: '90',
			}),
			'Assets:Bank should be 100 here, but is 90.',
		],
		[
			fault('BalanceAssertionAmbiguous', {
				location: at,
				account: 'Assets:Bank',
				unordered: 'b.rupee:2',
			}),
			'Assets:Bank could fall either side of b.rupee:2. Add a time to order them.',
		],
		[
			fault('CannotReadFile', { path: 'a.rupee', reason: 'too big' }),
			'This file can’t be read: too big.',
		],
		[
			fault('StorageConflict', { key: 'a.rupee', expected: null, actual: null }),
			'This file changed since you opened it.',
		],
		[fault('StorageNotFound', { key: 'a.rupee' }), 'This file no longer exists.'],
		[fault('StorageInvalidKey', { key: 'a.txt' }), '“a.txt” isn’t a valid file name.'],
		[fault('AuthInvalidCode'), 'Something went wrong (AuthInvalidCode).'],
	])('explains %o', (error, sentence) => {
		expect(explain(error)).toBe(sentence);
	});
});

describe('placesOf', () => {
	it('splits a location into each file and line it names', () => {
		const error = fault('EventWithManyPrimaries', {
			event: 'rent',
			location: 'a.rupee:4, b/c.rupee:9',
		});
		expect(placesOf(error)).toEqual([
			{ file: 'a.rupee', line: '4' },
			{ file: 'b/c.rupee', line: '9' },
		]);
	});

	it('keeps a place without a line as just its file', () => {
		const error = fault('ParseInvalidPosting', { location: 'a.rupee' });
		expect(placesOf(error)).toEqual([{ file: 'a.rupee', line: null }]);
	});

	it('names no places for an error without a location', () => {
		expect(placesOf(fault('StorageNotFound', { key: 'a.rupee' }))).toEqual([]);
	});
});

describe('isWarning', () => {
	it('treats balance assertions as warnings and the rest as problems', () => {
		const ambiguous = fault('BalanceAssertionAmbiguous', {
			location: at,
			account: 'Assets:Bank',
			unordered: at,
		});
		expect(isWarning(ambiguous)).toBe(true);
		expect(isWarning(fault('ParseInvalidPosting', { location: at }))).toBe(false);
	});
});
