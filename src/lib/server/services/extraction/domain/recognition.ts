import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { matchesGlob } from 'node:path';
import { match, P } from 'ts-pattern';
import { layout } from './runtime';
import type { Pattern, RupeaSchema } from './schema';
import type { Grid } from './types';

export type ParsedSchema = { key: string; content: string; schema: RupeaSchema };

type RecogniseOptions = {
	statement: string;
	grid: Grid;
	text: string[];
	schemas: { ledger: ParsedSchema[]; builtin: ParsedSchema[] };
};

// Exactly one schema, never the best of several, so adding a schema cannot change how another statement reads.
export const recognise = ({
	statement,
	grid,
	text,
	schemas,
}: RecogniseOptions): Result<ParsedSchema> => {
	const recognises = (s: ParsedSchema) =>
		s.schema.match.some((p) => matches({ pattern: p, statement, grid, text }));
	const matchesStructure = (s: ParsedSchema) =>
		layout({ schema: s.schema, file: statement, grid }).isOk();
	const readable = (l: ParsedSchema[]) => l.filter(recognises).filter(matchesStructure);

	const ours = readable(schemas.ledger);
	const found = ours.length > 0 ? ours : readable(schemas.builtin);

	const [only] = found;
	if (!only) return err(fault('ExtractionUnrecognised', { path: statement }));
	if (found.length > 1)
		return err(fault('ExtractionAmbiguous', { path: statement, schemas: found.map((s) => s.key) }));
	if (!only.schema.account) return err(fault('ExtractionWithoutAccount', { path: only.key }));

	return ok(only);
};

type MatchesOptions = {
	pattern: Pattern;
	statement: string;
	grid: Grid;
	text: string[];
};

const matches = ({ pattern, statement, grid, text }: MatchesOptions) => {
	const lines = [...grid.flat(), ...text];
	return match(pattern)
		.with({ file: P.select() }, (f) => matchesGlob(statement.toLowerCase(), f.toLowerCase()))
		.with({ text: P.select() }, (t) => lines.some((l) => l.toLowerCase().includes(t.toLowerCase())))
		.with({ regex: P.select() }, (r) => lines.some((l) => r.test(l)))
		.exhaustive();
};
