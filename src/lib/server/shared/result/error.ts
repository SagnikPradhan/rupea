// Parse locations are pre-rendered (`file:line`) to keep this free of domain imports.
export type RupeaError =
	| { type: 'CannotReadDirectory'; path: string; cause?: RupeaError[] }
	| { type: 'CannotReadFile'; path: string; reason: string; cause?: RupeaError[] }
	| { type: 'CannotMergeFile'; path: string }
	| { type: 'StorageInvalidKey'; key: string }
	| { type: 'StorageNotFound'; key: string }
	| { type: 'StorageConflict'; key: string; expected: string | null; actual: string | null }
	| { type: 'AuthInvalidCode' }
	| { type: 'AuthUnauthenticated' }
	| { type: 'StorageMissing'; userId: string }
	| { type: 'LedgerNotFound'; handle: string }
	| { type: 'NameTaken'; name: string }
	| { type: 'UniqueViolation'; constraint: string }
	| { type: 'ParseInvalidTransactionHeader'; location: string }
	| { type: 'ParseMissingTransactionBody'; location: string }
	| { type: 'ParseInvalidPosting'; location: string }
	| { type: 'ParseInvalidAccount'; location: string; account: string }
	| { type: 'ParseUnbalancedTransaction'; location: string; residual: string }
	| { type: 'ParseMultipleImplicitPostings'; location: string }
	| { type: 'ParseInvalidMetadata'; location: string }
	| { type: 'ParseDetachedMetadata'; location: string }
	| { type: 'ParseInvalidPrice'; location: string }
	| { type: 'ParseUnknownFeed'; location: string; feed: string }
	| { type: 'LinkRepeated'; location: string; commodity: string }
	| { type: 'FeedUnavailable'; feed: string; symbol: string; status?: number }
	| { type: 'FeedSymbolUnknown'; feed: string; symbol: string }
	| { type: 'FeedInvalidResponse'; feed: string; symbol: string; reason: string }
	| { type: 'GroupInvalidMembership'; location: string }
	| { type: 'GroupStale'; location: string }
	| { type: 'GroupIdTaken'; group: string }
	| { type: 'GroupWithoutPrimary'; group: string; location: string }
	| { type: 'GroupWithManyPrimaries'; group: string; location: string }
	| {
			type: 'GroupDisagreement';
			group: string;
			location: string;
			account: string;
			expected: string;
			actual: string;
	  }
	| {
			type: 'BalanceAssertionFailed';
			location: string;
			account: string;
			expected: string;
			actual: string;
	  }
	| { type: 'BalanceAssertionAmbiguous'; location: string; account: string; unordered: string }
	| { type: 'LotCostMissing'; location: string; account: string }
	| { type: 'LotNotOpen'; location: string; account: string; units: string }
	| { type: 'ReturnUnpriced'; account: string; unpriced: number }
	| { type: 'ReturnUnsolved'; account: string }
	| { type: 'ExtractionInvalidSchema'; path: string; reason: string }
	| { type: 'ExtractionUnsupportedFile'; path: string }
	| { type: 'ExtractionMissingModel'; path: string; cause?: RupeaError[] }
	| { type: 'ModelDownloadFailed'; url: string; status?: number; cause?: RupeaError[] }
	| { type: 'ModelHashMismatch'; path: string; expected: string; actual: string }
	| { type: 'ExtractionLocked'; path: string }
	| { type: 'ExtractionUnrecognised'; path: string }
	| { type: 'ExtractionAmbiguous'; path: string; schemas: string[] }
	| { type: 'ExtractionWithoutAccount'; path: string }
	| { type: 'ExtractionMissingHeader'; path: string }
	| { type: 'ExtractionMissingColumns'; path: string; columns: string[] }
	| { type: 'ExtractionInvalidField'; location: string; field: string; reason: string }
	| { type: 'JobUnknown'; name: string }
	| { type: 'JobOutdated'; name: string; version: number }
	| { type: 'JobInvalidPayload'; name: string; reason: string }
	| { type: 'JobTimedOut'; name: string; timeout: number }
	| { type: 'UnknownError'; message: string };

type Variant<T extends RupeaError['type']> = Extract<RupeaError, { type: T }>;
type Fields<T extends RupeaError['type']> = Omit<Variant<T>, 'type'>;

// Errors carrying nothing beyond their type take no fields.
export const fault = <T extends RupeaError['type']>(
	t: T,
	...[f]: object extends Fields<T> ? [] : [Fields<T>]
): Variant<T> => ({ type: t, ...f }) as Variant<T>;

export const unknownError = (t: unknown) =>
	fault('UnknownError', { message: t instanceof Error ? t.message : String(t) });
