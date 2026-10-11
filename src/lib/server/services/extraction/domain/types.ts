import type { Amount, RupeeParseLocation } from '#services/ledger/domain/types.ts';

export type Grid = string[][];

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
