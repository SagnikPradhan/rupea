import { vectorText } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { eq, sql } from 'drizzle-orm';
import { type Amount } from '../domain/amounts';
import type { History, Neighbour } from '../domain/prediction';
import { postings, transactions } from './database-schema';

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

const nearestQuery = (ledgerId: string, model: string, vectors: Float32Array[]) => sql`
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
`;

// The index covers every ledger, so it keeps scanning until enough rows are
// this ledger's; relaxed order is fine, as the domain sorts them again.
const nearest =
	(ledgerId: string, model: string) =>
	(vectors: Float32Array[]): ResultAsync<Neighbour[][]> => {
		if (vectors.length === 0) return okAsync([]);

		return withContext('db')((db) =>
			attempt(() =>
				db.transaction(async (tx) => {
					await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
					await tx.execute(sql.raw(`set local hnsw.ef_search = ${SEARCHED}`));
					return tx.execute<NeighbourRow>(nearestQuery(ledgerId, model, vectors));
				}),
			).map((r) => byQuery(vectors.length, r.rows)),
		);
	};

const accounts = (ledgerId: string) => (): ResultAsync<string[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectDistinct({ account: postings.account })
				.from(postings)
				.where(eq(postings.ledgerId, ledgerId)),
		).map((r) => r.map((a) => a.account)),
	);

export const history = (ledgerId: string, model: string): History => ({
	nearest: nearest(ledgerId, model),
	accounts: accounts(ledgerId),
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
