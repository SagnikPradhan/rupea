import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { InstantOut } from '@rupea/shared/dates.ts';
import { Email, Username } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { errors } from './errors.ts';

const User = v.object({ id: v.string(), email: v.string(), username: v.string() });

export type User = v.InferOutput<typeof User>;

const requestCode = oc
	.route({
		method: 'POST',
		path: '/auth/code',
		operationId: 'auth.requestCode',
		description: dedent`
			Mails a six-digit sign-in code to the address and answers the same whether
			or not it has an account, so the call does not reveal who has one.
		`,
	})
	.errors(errors)
	.input(v.object({ email: Email }));

const signIn = oc
	.route({
		method: 'POST',
		path: '/auth/sign-in',
		operationId: 'auth.signIn',
		description: dedent`
			Trades the mailed code for a session token, which later calls send as a
			bearer, and answers when the token expires.

			Fails with AuthInvalidCode when the code is wrong or has expired.
		`,
	})
	.errors(errors)
	.input(v.object({ email: Email, code: v.pipe(v.string(), v.trim(), v.regex(/^\d{6}$/)) }))
	.output(v.object({ token: v.string(), expiresAt: InstantOut }));

const signOut = oc
	.route({
		method: 'POST',
		path: '/auth/sign-out',
		operationId: 'auth.signOut',
		description: dedent`
			Ends the session of the bearer.

			Fails with AuthUnauthenticated when the bearer is not signed in.
		`,
	})
	.errors(errors);

const findUser = oc
	.route({
		method: 'GET',
		path: '/auth/user',
		operationId: 'auth.findUser',
		description: dedent`
			Answers who the bearer is, and a new expiry only when this call extended
			the session.

			Fails with AuthUnauthenticated when the bearer is not signed in.
		`,
	})
	.errors(errors)
	.output(v.object({ user: User, expiresAt: v.nullable(InstantOut) }));

const saveUsername = oc
	.route({
		method: 'PUT',
		path: '/auth/user/username',
		operationId: 'auth.saveUsername',
		description: dedent`
			Renames the bearer and answers who they are now.

			Fails with NameTaken when another user has the name.
		`,
	})
	.errors(errors)
	.input(v.object({ username: Username }))
	.output(User);

const requestEmailCode = oc
	.route({
		method: 'POST',
		path: '/auth/user/email-code',
		operationId: 'auth.requestEmailCode',
		description: dedent`
			Mails a six-digit code to a new address for the bearer, which saveEmail
			takes to move them to it.

			Fails with EmailTaken when another user has the address.
		`,
	})
	.errors(errors)
	.input(v.object({ email: Email }));

const saveEmail = oc
	.route({
		method: 'PUT',
		path: '/auth/user/email',
		operationId: 'auth.saveEmail',
		description: dedent`
			Moves the bearer to a new address with the code mailed to it, or without
			one while sign-in is off, and answers who they are now.

			Fails with AuthInvalidCode when the code is wrong or has expired, and with
			EmailTaken when another user has the address.
		`,
	})
	.errors(errors)
	.input(v.object({ email: Email, code: v.optional(v.pipe(v.string(), v.trim())) }))
	.output(User);

export const auth = {
	requestCode,
	signIn,
	signOut,
	findUser,
	saveUsername,
	requestEmailCode,
	saveEmail,
};
