import { implement, ORPCError } from '@orpc/server';
import { contract } from '@rupea/contract/contract.ts';
import type { FastifyBaseLogger } from 'fastify';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { answer } from './answer.ts';

export type Context = {
	token: string | null;
	log: FastifyBaseLogger;
};

export const os = implement(contract).$context<Context>();

const requireSession = (find: (token: string) => ResultAsync<Auth.Session | null>) =>
	os.middleware(async ({ context: { token, log }, next }) => {
		if (!token) throw new ORPCError('UNAUTHORIZED');

		const found = await find(token);
		if (found.isErr()) {
			log.error({ error: found.error }, 'session lookup failed');
			throw new ORPCError('INTERNAL_SERVER_ERROR');
		}

		const session = found.value;
		if (!session) throw new ORPCError('UNAUTHORIZED');

		return Auth.runAs(session.user, () => next({ context: { token, session } }));
	});

/** Answers 401 unless the bearer has a session, and runs the call for its user. */
export const signedIn = requireSession(Auth.findSession);

/** Answers as above, and renews a session that is past half its life. */
export const signedInRenewing = requireSession(Auth.validateSession);

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
