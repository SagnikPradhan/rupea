import { RupeaError } from '@rupea/shared/error.ts';
import * as v from 'valibot';

/** The HTTP status each failure is answered with. */
export const STATUS: Record<RupeaError['type'], 401 | 404 | 409 | 422 | 500 | 502> = {
	AuthUnauthenticated: 401,
	AuthInvalidCode: 401,

	LedgerNotFound: 404,
	TransactionNotFound: 404,
	StorageNotFound: 404,

	StorageConflict: 409,
	NameTaken: 409,
	UniqueViolation: 409,
	GroupIdTaken: 409,

	UnknownError: 500,
	StorageMissing: 500,
	CannotReadDirectory: 500,
	CannotReadFile: 500,
	CannotMergeFile: 500,
	CannotWriteTransaction: 500,
	CannotWriteTerms: 500,
	FeedSymbolUnknown: 500,
	ExtractionMissingModel: 500,
	ModelDownloadFailed: 500,
	ModelHashMismatch: 500,
	JobUnknown: 500,
	JobOutdated: 500,
	JobInvalidPayload: 500,
	JobTimedOut: 500,
	EventInvalidPayload: 500,

	FeedUnavailable: 502,
	FeedInvalidResponse: 502,

	StorageInvalidKey: 422,
	SpanReversed: 422,
	SpanTooLong: 422,
	ParseInvalidTransactionHeader: 422,
	ParseMissingTransactionBody: 422,
	ParseInvalidPosting: 422,
	ParseInvalidAccount: 422,
	ParseUnbalancedTransaction: 422,
	ParseMultipleImplicitPostings: 422,
	ParseInvalidMetadata: 422,
	ParseDetachedMetadata: 422,
	ParseInvalidPrice: 422,
	ParseUnknownFeed: 422,
	ParseInvalidAccountLine: 422,
	AccountRepeated: 422,
	LinkRepeated: 422,
	GroupInvalidMembership: 422,
	GroupStale: 422,
	GroupWithoutPrimary: 422,
	GroupWithManyPrimaries: 422,
	GroupDisagreement: 422,
	BalanceAssertionFailed: 422,
	BalanceAssertionAmbiguous: 422,
	LotCostMissing: 422,
	LotNotOpen: 422,
	ReturnUnpriced: 422,
	ReturnUnsolved: 422,
	CostUnpriced: 422,
	ExtractionInvalidSchema: 422,
	ExtractionUnsupportedFile: 422,
	ExtractionLocked: 422,
	ExtractionUnrecognised: 422,
	ExtractionAmbiguous: 422,
	ExtractionWithoutAccount: 422,
	ExtractionMissingHeader: 422,
	ExtractionMissingColumns: 422,
	ExtractionInvalidField: 422,
};

/** The code an error is thrown with, by status. */
export const CODE = {
	401: 'UNAUTHENTICATED',
	404: 'MISSING',
	409: 'CONFLICT',
	422: 'UNPROCESSABLE',
	500: 'FAULT',
	502: 'UPSTREAM',
} as const;

/** Each route lists these, as any call may fail with a RupeaError. */
export const errors = {
	UNAUTHENTICATED: { status: 401, data: RupeaError },
	MISSING: { status: 404, data: RupeaError },
	CONFLICT: { status: 409, data: RupeaError },
	UNPROCESSABLE: { status: 422, data: RupeaError },
	FAULT: { status: 500, data: RupeaError },
	UPSTREAM: { status: 502, data: RupeaError },
};

/**
 * What a call that works through many things answers: those it did, and why the
 * rest did not.
 */
export const batchOf = <T extends v.GenericSchema>(s: T) =>
	v.object({ succeeded: v.array(s), failed: v.array(RupeaError) });
