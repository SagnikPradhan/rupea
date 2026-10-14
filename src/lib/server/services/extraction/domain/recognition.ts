import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { matchesGlob } from 'node:path';
import { match, P } from 'ts-pattern';
import { layout } from './runtime';
import type { Pattern, RupeeSchema } from './schema';
import type { Grid } from './types';

export type Candidate = { key: string; content: string; schema: RupeeSchema };

type RecogniseOptions = {
	statement: string;
	grid: Grid;
	text: string[];
	ledger: Candidate[];
	builtin: Candidate[];
};

// Exactly one schema, never the best of several, so adding a schema cannot change how another statement reads.
export const recognise = (options: RecogniseOptions): Result<Candidate> => {
	const { statement, grid, text, ledger, builtin } = options;

	const matching = (c: Candidate) =>
		c.schema.match.some((p) => matches({ pattern: p, statement, grid, text }));
	const fits = (c: Candidate) =>
		matching(c) && layout({ schema: c.schema, file: statement, grid }).isOk();
	const ours = ledger.filter(fits);
	const found = ours.length > 0 ? ours : builtin.filter(fits);

	const [only] = found;
	if (!only) return err(fault('ExtractionUnrecognised', { path: statement }));
	if (found.length > 1)
		return err(fault('ExtractionAmbiguous', { path: statement, schemas: found.map((c) => c.key) }));
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
