import * as v from 'valibot';

const str = v.string();
const num = v.number();
const strs = v.array(v.string());
const causes = v.optional(v.array(v.lazy(() => RupeaError)));

const Plain = v.variant('type', [
	v.object({ type: v.literal('CannotMergeFile'), path: str }),
	v.object({ type: v.literal('CannotWriteTransaction'), path: str }),
	v.object({ type: v.literal('CannotWriteTerms'), path: str }),
	v.object({ type: v.literal('TransactionNotFound'), path: str, line: num }),
	v.object({ type: v.literal('StorageInvalidKey'), key: str }),
	v.object({ type: v.literal('StorageNotFound'), key: str }),
	v.object({
		type: v.literal('StorageConflict'),
		key: str,
		expected: v.nullable(str),
		actual: v.nullable(str),
	}),
	v.object({ type: v.literal('AuthInvalidCode') }),
	v.object({ type: v.literal('AuthUnauthenticated') }),
	v.object({ type: v.literal('StorageMissing'), userId: str }),
	v.object({ type: v.literal('LedgerNotFound'), handle: str }),
	v.object({ type: v.literal('NameTaken'), name: str }),
	v.object({ type: v.literal('UniqueViolation'), constraint: str }),
	v.object({ type: v.literal('ParseInvalidTransactionHeader'), location: str }),
	v.object({ type: v.literal('ParseMissingTransactionBody'), location: str }),
	v.object({ type: v.literal('ParseInvalidPosting'), location: str }),
	v.object({ type: v.literal('ParseInvalidAccount'), location: str, account: str }),
	v.object({ type: v.literal('ParseUnbalancedTransaction'), location: str, residual: str }),
	v.object({ type: v.literal('ParseMultipleImplicitPostings'), location: str }),
	v.object({ type: v.literal('ParseInvalidMetadata'), location: str }),
	v.object({ type: v.literal('ParseDetachedMetadata'), location: str }),
	v.object({ type: v.literal('ParseInvalidPrice'), location: str }),
	v.object({ type: v.literal('ParseUnknownFeed'), location: str, feed: str }),
	v.object({ type: v.literal('ParseInvalidAccountLine'), location: str }),
	v.object({ type: v.literal('AccountRepeated'), location: str, account: str }),
	v.object({ type: v.literal('LinkRepeated'), location: str, commodity: str }),
	v.object({ type: v.literal('FeedUnavailable'), feed: str, symbol: str, status: v.optional(num) }),
	v.object({ type: v.literal('FeedSymbolUnknown'), feed: str, symbol: str }),
	v.object({ type: v.literal('FeedInvalidResponse'), feed: str, symbol: str, reason: str }),
	v.object({ type: v.literal('GroupInvalidMembership'), location: str }),
	v.object({ type: v.literal('GroupStale'), location: str }),
	v.object({ type: v.literal('GroupIdTaken'), group: str }),
	v.object({ type: v.literal('GroupWithoutPrimary'), group: str, location: str }),
	v.object({ type: v.literal('GroupWithManyPrimaries'), group: str, location: str }),
	v.object({
		type: v.literal('GroupDisagreement'),
		group: str,
		location: str,
		account: str,
		expected: str,
		actual: str,
	}),
	v.object({
		type: v.literal('BalanceAssertionFailed'),
		location: str,
		account: str,
		expected: str,
		actual: str,
	}),
	v.object({
		type: v.literal('BalanceAssertionAmbiguous'),
		location: str,
		account: str,
		unordered: str,
	}),
	v.object({ type: v.literal('LotCostMissing'), location: str, account: str }),
	v.object({ type: v.literal('LotNotOpen'), location: str, account: str, units: str }),
	v.object({ type: v.literal('ReturnUnpriced'), account: str, unpriced: num }),
	v.object({ type: v.literal('ReturnUnsolved'), account: str }),
	v.object({ type: v.literal('CostUnpriced'), commodity: str }),
	v.object({ type: v.literal('ExtractionInvalidSchema'), path: str, reason: str }),
	v.object({ type: v.literal('ExtractionUnsupportedFile'), path: str }),
	v.object({ type: v.literal('ModelHashMismatch'), path: str, expected: str, actual: str }),
	v.object({ type: v.literal('ExtractionLocked'), path: str }),
	v.object({ type: v.literal('ExtractionUnrecognised'), path: str }),
	v.object({ type: v.literal('ExtractionAmbiguous'), path: str, schemas: strs }),
	v.object({ type: v.literal('ExtractionWithoutAccount'), path: str }),
	v.object({ type: v.literal('ExtractionMissingHeader'), path: str }),
	v.object({ type: v.literal('ExtractionMissingColumns'), path: str, columns: strs }),
	v.object({ type: v.literal('ExtractionInvalidField'), location: str, field: str, reason: str }),
	v.object({ type: v.literal('SpanReversed'), from: str, to: str }),
	v.object({ type: v.literal('SpanTooLong'), days: num, most: num }),
	v.object({ type: v.literal('JobUnknown'), name: str }),
	v.object({ type: v.literal('JobOutdated'), name: str, version: num }),
	v.object({ type: v.literal('JobInvalidPayload'), name: str, reason: str }),
	v.object({ type: v.literal('JobTimedOut'), name: str, timeout: num }),
	v.object({ type: v.literal('EventInvalidPayload'), name: str, reason: str }),
	v.object({ type: v.literal('UnknownError'), message: str }),
]);

type Caused =
	| { type: 'CannotReadDirectory'; path: string; cause?: RupeaError[] | undefined }
	| { type: 'CannotReadFile'; path: string; reason: string; cause?: RupeaError[] | undefined }
	| { type: 'ExtractionMissingModel'; path: string; cause?: RupeaError[] | undefined }
	| {
			type: 'ModelDownloadFailed';
			url: string;
			status?: number | undefined;
			cause?: RupeaError[] | undefined;
	  };

/**
 * Why something failed, as the type that names it and the fields that say what
 * went wrong.
 */
export type RupeaError = v.InferOutput<typeof Plain> | Caused;

/**
 * Valibot cannot infer a schema that refers to itself, so the four variants
 * that carry a cause are typed above and the rest are inferred.
 */
export const RupeaError: v.GenericSchema<RupeaError> = v.variant('type', [
	...Plain.options,
	v.object({ type: v.literal('CannotReadDirectory'), path: str, cause: causes }),
	v.object({ type: v.literal('CannotReadFile'), path: str, reason: str, cause: causes }),
	v.object({ type: v.literal('ExtractionMissingModel'), path: str, cause: causes }),
	v.object({
		type: v.literal('ModelDownloadFailed'),
		url: str,
		status: v.optional(num),
		cause: causes,
	}),
]);

type Variant<T extends RupeaError['type']> = Extract<RupeaError, { type: T }>;
type Fields<T extends RupeaError['type']> = Omit<Variant<T>, 'type'>;

// Errors carrying nothing beyond their type take no fields.
export const fault = <T extends RupeaError['type']>(
	t: T,
	...[f]: object extends Fields<T> ? [] : [Fields<T>]
): Variant<T> => ({ type: t, ...f }) as Variant<T>;

export const unknownError = (t: unknown) =>
	fault('UnknownError', { message: t instanceof Error ? t.message : String(t) });
