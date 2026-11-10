import { implement, ORPCError } from '@orpc/server';
import { contract } from '@rupea/contract/contract.ts';
import type { FastifyBaseLogger } from 'fastify';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/application/auth.ts';

export type Context = {
	token: string | null;
	log: FastifyBaseLogger;
};

export const os = implement(contract).$context<Context>();

const requireSession = (find: (token: string) => ResultAsync<Auth.Session | null>) =>
	os.middleware(async ({ context, next }) => {
		const { token, log } = context;
		if (!token) return Promise.reject(new ORPCError('UNAUTHORIZED'));

		const found = await find(token);
		if (found.isErr()) {
			log.error({ error: found.error }, 'session lookup failed');
			return Promise.reject(new ORPCError('INTERNAL_SERVER_ERROR'));
		}

		const session = found.value;
		if (!session) return Promise.reject(new ORPCError('UNAUTHORIZED'));

		return Auth.runAs(session.user, () => next({ context: { token, session } }));
	});

/** Answers 401 unless the bearer has a session, and runs the call for its user. */
export const signedIn = requireSession(Auth.findSession);

/** Answers as above, and renews a session that is past half its life. */
export const signedInRenewing = requireSession(Auth.validateSession);
