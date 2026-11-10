import { oc } from '@orpc/contract';
import { InstantOut } from '@rupea/shared/dates.ts';
import { Email } from '@rupea/shared/email.ts';
import * as v from 'valibot';
import { errors } from './errors.ts';

const User = v.object({ id: v.string(), email: v.string(), username: v.string() });

export type User = v.InferOutput<typeof User>;

/**
 * Mails a sign-in code, and answers the same whether or not the address has an
 * account.
 */
export const requestCode = oc
	.route({ method: 'POST', path: '/auth/code', operationId: 'requestCode' })
	.errors(errors)
	.input(v.object({ email: Email }));

/** Trades a mailed code for a session token, which later calls send as a bearer. */
export const signIn = oc
	.route({ method: 'POST', path: '/auth/sign-in', operationId: 'signIn' })
	.errors(errors)
	.input(v.object({ email: Email, code: v.pipe(v.string(), v.trim(), v.regex(/^\d{6}$/)) }))
	.output(v.object({ token: v.string(), expiresAt: InstantOut }));

/** Ends the session of the bearer. */
export const signOut = oc
	.route({ method: 'POST', path: '/auth/sign-out', operationId: 'signOut' })
	.errors(errors);

/** Who the bearer is, and a new expiry only when this call extended the session. */
export const findUser = oc
	.route({ method: 'GET', path: '/auth/user', operationId: 'findUser' })
	.errors(errors)
	.output(v.object({ user: User, expiresAt: v.nullable(InstantOut) }));
