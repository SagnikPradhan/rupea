import { implement, ORPCError } from '@orpc/server';
import { contract } from '@rupea/contract/contract.ts';
import type { FastifyBaseLogger } from 'fastify';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { answer } from './answer.ts';

export type Context = {
	token: string | null;
	/** Whether sign-in is off and the call comes from this computer. */
	local: boolean;
	log: FastifyBaseLogger;
};

export const os = implement(contract).$context<Context>();

type Find = (token: string) => ResultAsync<Auth.Session | null>;

const sessionOf = (find: Find, { token, local }: Context) => {
	if (token) return find(token);
	if (local) return Auth.findLocalSession();
	return okAsync(null);
};

const requireSession = (find: Find) =>
	os.middleware(async ({ context, next }) => {
		const { token, log } = context;
		const found = await sessionOf(find, context);
		if (found.isErr()) {
			log.error({ error: found.error }, 'session lookup failed');
			throw new ORPCError('INTERNAL_SERVER_ERROR');
		}

		const session = found.value;
		if (!session) throw new ORPCError('UNAUTHORIZED');

		return Auth.runAs(session.user, () => next({ context: { token, session } }));
	});

/**
 * Answers 401 unless the bearer has a session or the call is local, and runs
 * the call for its user.
 */
export const signedIn = requireSession(Auth.findSession);

/** Answers as above, and renews a session that is past half its life. */
export const signedInRenewing = requireSession(Auth.validateSession);

/**
 * Runs the call for the bearer's user when there is one, and for nobody when
 * not.
 */
export const signedInOrNot = os.middleware(async ({ context, next }) => {
	const found = await sessionOf(Auth.findSession, context);
	const session = found.isOk() ? found.value : null;
	if (!session) return next();

	return Auth.runAs(session.user, () => next());
});

type InLedgerOptions<T> = {
	handle: string;
	action: (ledger: Ledger.Ledger) => ResultAsync<T>;
};

/**
 * Runs the action on the ledger of the handle, if the signed-in user may open
 * it; the answer to every call that names a ledger.
 */
export const inLedger = <T>({ handle, action }: InLedgerOptions<T>): Promise<T> =>
	answer(Auth.withCurrentUser((u) => Ledger.withLedger({ user: u.id, handle, action })));
