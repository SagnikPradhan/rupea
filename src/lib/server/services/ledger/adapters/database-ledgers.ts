import { attemptWrite, violates } from '#lib/server/db/errors.ts';
import type { Database } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { attempt, err, ok, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';
import type { Ledger } from '../domain/types';

export const findLedger = (userId: string, handle: string): ResultAsync<Ledger> =>
	withContext('db')((db) =>
		attempt(() =>
			reachable(db, userId).where('ledgers.handle', '=', handle).limit(1).execute(),
		).andThen(([f]) => (f ? ok(f) : err(fault('LedgerNotFound', { handle })))),
	);

export const listLedgers = (u: string): ResultAsync<Ledger[]> =>
	withContext('db')((db) => attempt(() => reachable(db, u).execute()));

type CreateLedgerOptions = {
	owner: string;
	handle: string;
	name: string;
};

export const createLedger = ({ owner, handle, name }: CreateLedgerOptions): ResultAsync<Ledger> =>
	withContext('db')((db) =>
		attemptWrite(() =>
			db
				.insertInto('ledgers')
				.values({ ownerId: owner, handle, name })
				.returning('id')
				.executeTakeFirstOrThrow()
				.then((i) => ({ id: i.id, handle, name, owner })),
		).mapErr((e) =>
			violates(e, 'ledgers_handle_unique') ? fault('NameTaken', { name: handle }) : e,
		),
	);

/** Holds the ledger's lock until the transaction ends, so its writers take turns. */
export const lockLedger = (ledgerId: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await sql`select pg_advisory_xact_lock(hashtextextended(${ledgerId}, 0))`.execute(db);
		}),
	);

// A user reaches the ledgers they own and those they are a member of.
const reachable = (db: Database, userId: string) =>
	db
		.selectFrom('ledgers')
		.leftJoin('memberships', (j) =>
			j.onRef('memberships.ledgerId', '=', 'ledgers.id').on('memberships.userId', '=', userId),
		)
		.where((w) => w.or([w('ledgers.ownerId', '=', userId), w('memberships.id', 'is not', null)]))
		.select(['ledgers.id', 'ledgers.handle', 'ledgers.name', 'ledgers.ownerId as owner'])
		.orderBy('ledgers.createdAt');
