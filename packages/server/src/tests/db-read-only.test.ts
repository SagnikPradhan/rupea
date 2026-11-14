import { consistently } from '#lib/server/db/read-only.ts';
import { provide, withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '@rupea/shared/errors.ts';
import { attempt, errAsync } from '#lib/server/shared/result/result.ts';
import { count } from '@rupea/server/tests/shared/count.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect } from 'vitest';

const countUsers = (id: string) =>
	withContext('db')((db) => attempt(() => count(db.selectFrom('users').where('id', '=', id))));

const insertUser = (id: string) =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.insertInto('users')
				.values({ id, email: `${id}@example.com`, username: id })
				.execute(),
		),
	);

describe('a consistent read', () => {
	it('sees one snapshot while another connection writes', ({ context, db }) =>
		provide(context, async () => {
			const id = uuidv7();

			const seen = await consistently(() =>
				countUsers(id).andThen((before) =>
					attempt(() =>
						db
							.insertInto('users')
							.values({ id, email: `${id}@example.com`, username: id })
							.execute(),
					)
						.andThen(() => countUsers(id))
						.map((after) => [before, after]),
				),
			);

			expect(seen._unsafeUnwrap()).toEqual([0, 0]);
			expect(await count(db.selectFrom('users').where('id', '=', id))).toBe(1);
		}));

	it('fails a write inside it as read only', ({ context, db }) =>
		provide(context, async () => {
			const id = uuidv7();

			const done = await consistently(() => insertUser(id));

			expect(done.isErr()).toBe(true);
			expect(await count(db.selectFrom('users').where('id', '=', id))).toBe(0);
		}));

	it('hands back the error of a failed read', ({ context }) =>
		provide(context, async () => {
			const failure = fault('LedgerNotFound', { handle: 'nowhere' });

			const done = await consistently(() => errAsync(failure));

			expect(done._unsafeUnwrapErr()).toEqual(failure);
		}));

	it('reuses a transaction that is already open', ({ context, db }) =>
		provide(context, async () => {
			const id = uuidv7();

			const seen = await db
				.transaction()
				.execute((tx) =>
					provide({ ...context, db: tx }, async () =>
						insertUser(id).andThen(() => consistently(() => countUsers(id))),
					),
				);

			expect(seen._unsafeUnwrap()).toBe(1);
		}));
});
