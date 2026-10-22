import { match } from 'ts-pattern';
import type { RupeeError } from '#lib/server/shared/result/error.ts';

export type Place = { file: string; line: string | null };

/** Says what went wrong in a sentence; where it went wrong is left to `placesOf`. */
export const explain = (error: RupeeError): string =>
	match(error)
		.with(
			{ type: 'ParseInvalidTransactionHeader' },
			() => 'This line should start a transaction with a date and a description.',
		)
		.with({ type: 'ParseMissingTransactionBody' }, () => 'This transaction has no postings.')
		.with({ type: 'ParseInvalidPosting' }, () => 'This posting can’t be read.')
		.with({ type: 'ParseInvalidAccount' }, (e) => `“${e.account}” isn’t a valid account name.`)
		.with(
			{ type: 'ParseUnbalancedTransaction' },
			(e) => `This transaction is off by ${e.residual}.`,
		)
		.with(
			{ type: 'ParseMultipleImplicitPostings' },
			() => 'Only one posting can leave out its amount.',
		)
		.with({ type: 'ParseInvalidMetadata' }, () => 'This metadata line can’t be read.')
		.with({ type: 'ParseDetachedMetadata' }, () => 'This metadata line isn’t under a transaction.')
		.with(
			{ type: 'ParseInvalidLink' },
			() => 'This link should name a date or *, a commodity and feed:symbol.',
		)
		.with({ type: 'ParseUnknownFeed' }, (e) => `“${e.feed}” isn’t a feed. Link to mfapi or yahoo.`)
		.with(
			{ type: 'LinkRepeated' },
			(e) => `${e.commodity} is linked more than once from the same day.`,
		)
		.with(
			{ type: 'EventInvalidMembership' },
			() => 'This transaction belongs to more than one event.',
		)
		.with(
			{ type: 'EventStale' },
			() => 'This event changed since it was read. Reload and try again.',
		)
		.with({ type: 'EventWithoutPrimary' }, (e) => `Event ${e.event} has no primary transaction.`)
		.with(
			{ type: 'EventWithManyPrimaries' },
			(e) => `Event ${e.event} has more than one primary transaction.`,
		)
		.with(
			{ type: 'EventDisagreement' },
			(e) => `Event ${e.event} disagrees on ${e.account}: expected ${e.expected}, got ${e.actual}.`,
		)
		.with(
			{ type: 'BalanceAssertionFailed' },
			(e) => `${e.account} should be ${e.expected} here, but is ${e.actual}.`,
		)
		.with(
			{ type: 'BalanceAssertionAmbiguous' },
			(e) => `${e.account} could fall either side of ${e.unordered}. Add a time to order them.`,
		)
		.with({ type: 'CannotReadFile' }, (e) => `This file can’t be read: ${e.reason}.`)
		.with({ type: 'StorageConflict' }, () => 'This file changed since you opened it.')
		.with({ type: 'StorageNotFound' }, () => 'This file no longer exists.')
		.with({ type: 'StorageInvalidKey' }, (e) => `“${e.key}” isn’t a valid file name.`)
		.otherwise((e) => `Something went wrong (${e.type}).`);

/** Splits a location like `a.rupee:4, b.rupee:9` into the places it names. */
export const placesOf = (e: RupeeError): Place[] =>
	'location' in e ? e.location.split(', ').map(toPlace) : [];

const toPlace = (text: string): Place => {
	const found = /^(.*):(\d+)$/.exec(text);
	return found?.[1] && found[2] ? { file: found[1], line: found[2] } : { file: text, line: null };
};

/** Assertions only check the ledger; nothing is wrong with the data they point at. */
export const isWarning = (e: RupeeError) =>
	e.type === 'BalanceAssertionFailed' || e.type === 'BalanceAssertionAmbiguous';
