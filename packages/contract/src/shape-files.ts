import { EntryOut, Key, MOST_KEYS } from '@rupea/shared/files.ts';
import { StatementKey } from '@rupea/shared/statements.ts';
import * as v from 'valibot';

export const Version = v.string();

export const Moves = v.pipe(
	v.array(v.object({ from: Key, to: Key })),
	v.minLength(1),
	v.maxLength(MOST_KEYS),
);

export const FileKeys = v.pipe(v.array(Key), v.minLength(1), v.maxLength(MOST_KEYS));

export const Addition = v.object({
	file: EntryOut,
	added: v.number(),
	skipped: v.number(),
	before: v.nullable(v.string()),
	draft: v.string(),
});

export const Contents = v.object({ key: v.string(), grid: v.array(v.array(v.string())) });

export const StatementKeys = v.pipe(v.array(StatementKey), v.minLength(1), v.maxLength(MOST_KEYS));
