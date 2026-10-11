import { and, desc, eq, sql } from 'drizzle-orm';
import { postings, transactions } from '#lib/server/db/schema.ts';
import { inOrder, ROWS_PER_STATEMENT } from '#lib/server/db/index.ts';
import { batches } from '#lib/server/shared/batches.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, okAsync } from '#lib/server/shared/result.ts';
import type { Amount } from '#services/ledger/domain/types.ts';
import type { History, Neighbour } from '../domain/prediction';

// Transactions searched near each line; the domain keeps the best few postings.
const NEAREST = 50;

// Candidates the index keeps while searching; at least `NEAREST`.
const SEARCHED = 200;

type NeighbourRow = {
	query: string;
	account: string;
	amount: string;
	date: string;
	similarity: number;
};

const vectorText = (v: Float32Array) => `[${v.join(',')}]`;

export const history = (ledgerId: string, model: string): History => ({
	unembedded: (limit) =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.select({ id: transactions.id, description: transactions.description })
					.from(transactions)
					.where(
						and(
							eq(transactions.ledgerId, ledgerId),
							sql`${transactions.embeddingModel} is distinct from ${model}`,
						),
					)
					.orderBy(desc(transactions.date))
					.limit(limit),
			),
		),

	fill: (rows) =>
		withContext('db')((db) =>
			attempt(() =>
				db.transaction((tx) =>
					inOrder(
						batches(rows, ROWS_PER_STATEMENT).map(
							(c) => () =>
								tx.execute(sql`
									update ${transactions} t
									set embedding = f.embedding::vector, embedding_model = ${model}
									from unnest(
										${sql.param(c.map((r) => r.id))}::uuid[],
										${sql.param(c.map((r) => (r.vector ? vectorText(r.vector) : null)))}::text[]
									) as f(id, embedding)
									where t.id = f.id
								`),
						),
					),
				),
			),
		),

	// The index covers every ledger, so it keeps scanning until enough rows are
	// this ledger's; relaxed order is fine, as the domain sorts them again.
	nearest: (vectors) =>
		vectors.length === 0
			? okAsync([])
			: withContext('db')((db) =>
					attempt(() =>
						db.transaction(async (tx) => {
							await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
							await tx.execute(sql.raw(`set local hnsw.ef_search = ${SEARCHED}`));
							return tx.execute<NeighbourRow>(sql`
								select q.i::text as query, p.account, p.amount::text as amount, n.date::text as date, n.similarity
								from unnest(${sql.param(vectors.map(vectorText))}::text[]::vector[]) with ordinality as q(v, i)
								cross join lateral (
									select t.id, t.date, 1 - (t.embedding <=> q.v) as similarity
									from ${transactions} t
									where t.ledger_id = ${ledgerId} and t.embedding_model = ${model} and t.embedding is not null
									order by t.embedding <=> q.v
									limit ${NEAREST}
								) n
								join ${postings} p on p.transaction_id = n.id
							`);
						}),
					).map((r) => byQuery(vectors.length, r.rows)),
				),

	accounts: () =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.selectDistinct({ account: postings.account })
					.from(postings)
					.where(eq(postings.ledgerId, ledgerId)),
			).map((r) => r.map((a) => a.account)),
		),
});

// `query` counts from 1, as `with ordinality` does.
const byQuery = (count: number, rows: NeighbourRow[]): Neighbour[][] => {
	const grouped = Object.groupBy(rows, (r) => r.query);
	return Array.from({ length: count }, (_, i) =>
		(grouped[String(i + 1)] ?? []).map((r) => ({
			account: r.account,
			amount: BigInt(r.amount) as Amount,
			date: Temporal.PlainDate.from(r.date),
			similarity: Number(r.similarity),
		})),
	);
};
