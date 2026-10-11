// Parse locations are pre-rendered (`file:line`) to keep this free of domain imports.
export type RupeeError =
	| { type: 'CannotReadDirectory'; path: string; cause: RupeeError[] }
	| {
			type: 'CannotReadFile';
			path: string;
			reason: string;
			cause: RupeeError[];
	  }
	| { type: 'StorageInvalidKey'; key: string; cause: RupeeError[] }
	| { type: 'StorageNotFound'; key: string; cause: RupeeError[] }
	| {
			type: 'StorageConflict';
			key: string;
			expected: string | null;
			actual: string | null;
			cause: RupeeError[];
	  }
	| { type: 'AuthInvalidCode'; cause: RupeeError[] }
	| { type: 'AuthUnauthenticated'; cause: RupeeError[] }
	| { type: 'StorageMissing'; userId: string; cause: RupeeError[] }
	| { type: 'LedgerNotFound'; handle: string; cause: RupeeError[] }
	| { type: 'NameTaken'; name: string; cause: RupeeError[] }
	| {
			type: 'ParseInvalidTransactionHeader';
			location: string;
			cause: RupeeError[];
	  }
	| {
			type: 'ParseMissingTransactionBody';
			location: string;
			cause: RupeeError[];
	  }
	| { type: 'ParseInvalidPosting'; location: string; cause: RupeeError[] }
	| {
			type: 'ParseInvalidAccount';
			location: string;
			account: string;
			cause: RupeeError[];
	  }
	| {
			type: 'ParseUnbalancedTransaction';
			location: string;
			residual: string;
			cause: RupeeError[];
	  }
	| { type: 'ParseMultipleImplicitPostings'; location: string; cause: RupeeError[] }
	| { type: 'ParseInvalidMetadata'; location: string; cause: RupeeError[] }
	| { type: 'ParseDetachedMetadata'; location: string; cause: RupeeError[] }
	| { type: 'EventInvalidMembership'; location: string; cause: RupeeError[] }
	| { type: 'RefinementStale'; location: string; cause: RupeeError[] }
	| { type: 'RefinementNameTaken'; event: string; cause: RupeeError[] }
	| { type: 'EventWithoutPrimary'; event: string; location: string; cause: RupeeError[] }
	| { type: 'EventWithManyPrimaries'; event: string; location: string; cause: RupeeError[] }
	| {
			type: 'EventDisagreement';
			event: string;
			location: string;
			account: string;
			expected: string;
			actual: string;
			cause: RupeeError[];
	  }
	| {
			type: 'BalanceAssertionFailed';
			location: string;
			account: string;
			expected: string;
			actual: string;
			cause: RupeeError[];
	  }
	| {
			type: 'BalanceAssertionAmbiguous';
			location: string;
			account: string;
			unordered: string;
			cause: RupeeError[];
	  }
	| {
			type: 'ExtractionInvalidSchema';
			path: string;
			reason: string;
			cause: RupeeError[];
	  }
	| { type: 'ExtractionUnsupportedFile'; path: string; cause: RupeeError[] }
	| { type: 'ExtractionMissingModel'; path: string; cause: RupeeError[] }
	| {
			type: 'ModelDownloadFailed';
			url: string;
			status?: number;
			cause: RupeeError[];
	  }
	| {
			type: 'ModelHashMismatch';
			path: string;
			expected: string;
			actual: string;
			cause: RupeeError[];
	  }
	| { type: 'ExtractionPdfPassword'; path: string; cause: RupeeError[] }
	| { type: 'ExtractionMissingHeader'; path: string; cause: RupeeError[] }
	| {
			type: 'ExtractionMissingColumns';
			path: string;
			columns: string[];
			cause: RupeeError[];
	  }
	| {
			type: 'ExtractionInvalidField';
			location: string;
			field: string;
			reason: string;
			cause: RupeeError[];
	  }
	| { type: 'UnknownError'; message: string; cause: RupeeError[] };

export const unknownError = (thrown: unknown): RupeeError => ({
	type: 'UnknownError',
	message: thrown instanceof Error ? thrown.message : String(thrown),
	cause: [],
});
