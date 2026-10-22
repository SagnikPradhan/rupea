import type { Amount, RupeeParseLocation } from '#services/ledger/application/shared.ts';

export type Grid = string[][];

/** A file as it was uploaded, named as the user named it. */
export type Upload = { name: string; content: Uint8Array };

/** An upload with the password that opens it. */
export type LockedUpload = { name: string; content: Uint8Array; password: string };

/** What a statement holds: its tables as one grid, and the lines of text outside them. */
export type Contents = { grid: Grid; text: string[] };

export type RupeeRecord = {
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	amount: Amount;
	description: string;
	category: string | null;
	balance: Amount | null;
};

// Two-digit years (`dd/MM/yy`) read as 1950–2049.
export const STATEMENT_ERA = new Date(2000, 0, 1);
