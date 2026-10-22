import { provide, withContext } from '../shared/context/context';
import { unknownError, type RupeeError } from '../shared/result/error';
import { attempt, type ResultAsync } from '../shared/result/result';

type Rollback = { rollback: RupeeError };

/** Runs `f` in one database transaction, provided as `db`; a failed result rolls it back. */
export const atomically = <T>(f: () => ResultAsync<T>): ResultAsync<T> =>
	withContext()((context) =>
		attempt(
			() =>
				context.db.transaction((db) =>
					provide({ ...context, db }, () => f().match((v) => v, rollback)),
				),
			(t) => (isRollback(t) ? t.rollback : unknownError(t)),
		),
	);

/** Throws, since Drizzle rolls a transaction back only when its callback throws. */
const rollback = (e: RupeeError): never => {
	// eslint-disable-next-line functional/no-throw-statements -- see above
	throw { rollback: e } satisfies Rollback;
};

const isRollback = (t: unknown): t is Rollback =>
	typeof t === 'object' && t !== null && 'rollback' in t;
