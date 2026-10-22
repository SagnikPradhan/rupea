import { attemptWrite, violates } from '#lib/server/db/errors.ts';
import type { Database } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { attempt, err, ok, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, asc, eq, isNotNull, or, type SQL } from 'drizzle-orm';
import type { Ledger } from '../domain/types';
import { ledgers, memberships } from './database-schema';

const ledgerColumns = {
	id: ledgers.id,
	handle: ledgers.handle,
	name: ledgers.name,
	owner: ledgers.ownerId,
};

export const findLedger = (userId: string, handle: string): ResultAsync<Ledger> =>
	withContext('db')((db) =>
		attempt(() => reachable(db, userId, eq(ledgers.handle, handle)).limit(1)).andThen(([f]) =>
			f ? ok(f) : err(fault('LedgerNotFound', { handle })),
		),
	);

export const listLedgers = (u: string): ResultAsync<Ledger[]> =>
	withContext('db')((db) => attempt(() => reachable(db, u, undefined)));

type CreateLedgerOptions = {
	owner: string;
	handle: string;
	name: string;
};

export const createLedger = ({ owner, handle, name }: CreateLedgerOptions): ResultAsync<Ledger> =>
	withContext('db')((db) =>
		attemptWrite(() =>
			db
				.insert(ledgers)
				.values({ ownerId: owner, handle, name })
				.returning({ id: ledgers.id })
				.then(([i]) => i ?? Promise.reject(new Error(`${handle} was not saved`)))
				.then((i) => ({ id: i.id, handle, name, owner })),
		).mapErr((e) =>
			violates(e, 'ledgers_handle_unique') ? fault('NameTaken', { name: handle }) : e,
		),
	);

// A user reaches the ledgers they own and those they are a member of.
const reachable = (db: Database, userId: string, where: SQL | undefined) =>
	db
		.select(ledgerColumns)
		.from(ledgers)
		.leftJoin(
			memberships,
			and(eq(memberships.ledgerId, ledgers.id), eq(memberships.userId, userId)),
		)
		.where(and(where, or(eq(ledgers.ownerId, userId), isNotNull(memberships.id))))
		.orderBy(asc(ledgers.createdAt));
