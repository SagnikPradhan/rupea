import { and, eq, inArray } from 'drizzle-orm';
import { embeddings as table } from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { inOrder } from '#lib/server/db/index.ts';
import { attempt, concat } from '#lib/server/shared/result.ts';
import type { EmbeddingStore } from '../domain/prediction';

// Well under Postgres's limit of 65535 parameters per statement.
const CHUNK = 500;

const chunks = <T>(l: T[]): T[][] =>
	Array.from({ length: Math.ceil(l.length / CHUNK) }, (_, i) =>
		l.slice(i * CHUNK, (i + 1) * CHUNK),
	);

export const embeddings = (ledgerId: string, model: string): EmbeddingStore => ({
	find: (texts) =>
		withContext('db')((db) =>
			concat(
				chunks(texts).map(
					(c) => () =>
						attempt(() =>
							db
								.select({ text: table.text, vector: table.vector })
								.from(table)
								.where(
									and(eq(table.ledgerId, ledgerId), eq(table.model, model), inArray(table.text, c)),
								),
						),
				),
			).map((l) => new Map(l.map((r) => [r.text, Float32Array.from(r.vector)]))),
		),

	save: (vectors) =>
		withContext('db')((db) =>
			attempt(() =>
				db.transaction((tx) =>
					inOrder(
						chunks([...vectors]).map(
							(c) => () =>
								tx
									.insert(table)
									.values(
										c.map(([text, vector]) => ({
											ledgerId,
											model,
											text,
											vector: Array.from(vector),
										})),
									)
									.onConflictDoNothing(),
						),
					),
				),
			),
		),
});
