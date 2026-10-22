import { atomically } from '#lib/server/db/atomically.ts';
import { provide, withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync } from '#lib/server/shared/result/result.ts';
import { count } from '#tests/shared/count.ts';
import { it } from '#tests/shared/vitest.ts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect } from 'vitest';

const insertUser = (id: string) =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.insertInto('users')
				.values({ id, email: `${id}@example.com`, username: id })
				.execute(),
		),
	);

describe('a transaction', () => {
	it('keeps every write when it succeeds', ({ context, db }) =>
		provide(context, async () => {
			const [a, b] = [uuidv7(), uuidv7()];

			const done = await atomically(() => insertUser(a).andThen(() => insertUser(b)));

			expect(done.isOk()).toBe(true);
			expect(await count(db.selectFrom('users').where('id', 'in', [a, b]))).toBe(2);
		}));

	it('keeps no write when it fails, and hands back the error', ({ context, db }) =>
		provide(context, async () => {
			const id = uuidv7();
			const failure = fault('LedgerNotFound', { handle: 'nowhere' });

			const done = await atomically(() => insertUser(id).andThen(() => errAsync(failure)));

			expect(done._unsafeUnwrapErr()).toEqual(failure);
			expect(await count(db.selectFrom('users').where('id', '=', id))).toBe(0);
		}));

	it('turns a throw into an unknown error', ({ context }) =>
		provide(context, async () => {
			const done = await atomically(() => attempt(() => Promise.reject(new Error('boom'))));

			expect(done._unsafeUnwrapErr()).toEqual(fault('UnknownError', { message: 'boom' }));
		}));

	it('runs the queries inside it on its own connection', ({ context, db }) =>
		provide(context, async () => {
			const id = uuidv7();

			const seen = await atomically(() =>
				insertUser(id).andThen(() =>
					attempt(() => count(db.selectFrom('users').where('id', '=', id))),
				),
			);

			expect(seen._unsafeUnwrap()).toBe(0);
			expect(await count(db.selectFrom('users').where('id', '=', id))).toBe(1);
		}));

	it('rolls back only its own writes when it fails inside another', ({ context, db }) =>
		provide(context, async () => {
			const [kept, undone] = [uuidv7(), uuidv7()];
			const failure = fault('LedgerNotFound', { handle: 'nowhere' });

			const done = await atomically(() =>
				insertUser(kept).andThen(() =>
					atomically(() => insertUser(undone).andThen(() => errAsync(failure))).orElse(() =>
						insertUser(uuidv7()),
					),
				),
			);

			expect(done.isOk()).toBe(true);
			expect(await count(db.selectFrom('users').where('id', '=', kept))).toBe(1);
			expect(await count(db.selectFrom('users').where('id', '=', undone))).toBe(0);
		}));

	it('stays usable after a write inside it breaks a constraint', ({ context, db }) =>
		provide(context, async () => {
			const [taken, after] = [uuidv7(), uuidv7()];

			const done = await atomically(() =>
				insertUser(taken).andThen(() =>
					atomically(() => insertUser(taken)).orElse(() => insertUser(after)),
				),
			);

			expect(done.isOk()).toBe(true);
			expect(await count(db.selectFrom('users').where('id', 'in', [taken, after]))).toBe(2);
		}));
});
