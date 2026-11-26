import type { LedgerReading } from '#lib/server/shared/context/config.ts';
import { fault } from '@rupea/shared/errors.ts';
import { byCodeUnit } from '@rupea/shared/text.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { toMetadata } from './nodes';
import { baseOf, parseTree } from './parser';
import { print } from './printer';
import type { RupeaFile } from './types';

type SetBaseOptions = { file: Pick<RupeaFile, 'key' | 'content'>; base: string };

/**
 * Writes the base atop a file, in place of any it names, only if the file then
 * reads back in it.
 */
export const setBase = (c: LedgerReading, { file, base }: SetBaseOptions): Result<string> => {
	const tree = parseTree(c, file);
	const kept = tree.metadata.filter(([k]) => k !== 'base');
	const content = print(c, { ...tree, metadata: [['base', base], ...kept] });
	const read = parseTree(c, { key: file.key, content });

	return baseOf(toMetadata(read.metadata)) === base
		? ok(content)
		: err(fault('CannotWriteBase', { path: file.key }));
};

/** The base and every currency a chain of prices links it to, in order. */
export const currenciesFrom = (pairs: [string, string][], base: string): string[] => {
	const reached = [base];
	for (const c of reached)
		for (const [a, b] of pairs) {
			if (a === c && !reached.includes(b)) reached.push(b);
			if (b === c && !reached.includes(a)) reached.push(a);
		}

	return reached.toSorted(byCodeUnit);
};
