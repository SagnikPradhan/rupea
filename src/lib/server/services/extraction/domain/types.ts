import type { Amount, RupeeParseLocation } from '#lib/server/services/ledger/domain/types.ts';

/**
 * A statement's cells as text, row by row, whatever the file it came from.
 * Rows may differ in length.
 */
export type Grid = string[][];

/** One statement line, as the schema's fields read it. */
export type RupeeRecord = {
	/** The statement file and 1-based row. */
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	/** Money into the statement's account; negative when it went out. */
	amount: Amount;
	description: string;
	/** The account on the other side, if the statement says. */
	category: string | null;
};

/**
 * What statement dates are read relative to, so that a two-digit year
 * (`dd/MM/yy`, common in bank statements) reads as 1950–2049.
 */
export const STATEMENT_ERA = new Date(2000, 0, 1);
