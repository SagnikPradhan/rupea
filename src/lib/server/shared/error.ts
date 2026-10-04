/**
 * Every kind of error the server can report. Errors are values (ADR 0002):
 * they are returned in a `Result`, `ResultAsync` or `Batch`, never thrown.
 *
 * Parse errors carry their location pre-rendered (`file:line`) so this module
 * stays free of any domain dependency.
 */
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
			/** The version the caller expected; `null` for "must not exist". */
			expected: string | null;
			/** The version actually stored; `null` when nothing is. */
			actual: string | null;
			cause: RupeeError[];
	  }
	| { type: 'AuthInvalidCode'; cause: RupeeError[] }
	| { type: 'AuthUnauthenticated'; cause: RupeeError[] }
	/** The user has no ledger to work in. */
	| { type: 'LedgerNotFound'; userId: string; cause: RupeeError[] }
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
			type: 'ExtractionInvalidSchema';
			path: string;
			reason: string;
			cause: RupeeError[];
	  }
	| { type: 'ExtractionUnsupportedFile'; path: string; cause: RupeeError[] }
	/** A table recognition model is not where it should be. */
	| { type: 'ExtractionMissingModel'; path: string; cause: RupeeError[] }
	/** A model could not be downloaded; `status` is the HTTP one, if any. */
	| {
			type: 'ModelDownloadFailed';
			url: string;
			status?: number;
			cause: RupeeError[];
	  }
	/** A model file is not the pinned revision. */
	| {
			type: 'ModelHashMismatch';
			path: string;
			expected: string;
			actual: string;
			cause: RupeeError[];
	  }
	/** A PDF that needs a password was given none, or the wrong one. */
	| { type: 'ExtractionPdfPassword'; path: string; cause: RupeeError[] }
	/** No row of the statement looks like the schema's header row. */
	| { type: 'ExtractionMissingHeader'; path: string; cause: RupeeError[] }
	/** Columns the schema names that the statement's header row lacks. */
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
