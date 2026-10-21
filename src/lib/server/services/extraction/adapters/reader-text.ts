import { safely } from '#lib/server/shared/control.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Contents } from '../domain/types';

/** Ledger files Rupee reads as they are written: its own, and ledger's and hledger's in the syntax they share. */
export const TEXT_EXTENSIONS = ['.rupee', '.ledger', '.journal', '.dat', '.txt'];

const decoder = new TextDecoder('utf-8', { fatal: true });

type TextOptions = {
	name: string;
	content: Uint8Array;
};

/** Its lines, kept exactly, with no grid. */
export const readText = (o: TextOptions): ResultAsync<Contents> => {
	const text = safely(() => decoder.decode(o.content));
	return text === undefined
		? errAsync(fault('CannotReadFile', { path: o.name, reason: 'not valid UTF-8' }))
		: okAsync({ grid: [], text: text.split('\n') });
};
