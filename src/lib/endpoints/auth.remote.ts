import * as v from 'valibot';
import { invalid, redirect } from '@sveltejs/kit';
import { form } from '$app/server';
import {
	deleteSessionCookie,
	readSessionCookie,
	setSessionCookie,
} from '@rupea/server/services/auth/adapters/request.ts';
import * as Auth from '@rupea/server/services/auth/application/auth.ts';
import { withLogger } from '@rupea/server/shared/context/logger.ts';
import { replyFrom } from '@rupea/server/shared/result/reply.ts';

const Email = v.pipe(
	v.string(),
	v.transform(Auth.normalizeEmail),
	v.email('Enter a valid email address.'),
);

/** Returns the normalised email so the code step can carry it. */
export const requestCode = form(v.object({ email: Email }), ({ email }) =>
	replyFrom(Auth.requestCode(email).map(() => ({ email }))),
);

export const verifyCode = form(
	v.object({
		email: Email,
		code: v.pipe(v.string(), v.trim(), v.regex(/^\d{6}$/, 'The code is 6 digits.')),
	}),
	async ({ email, code }) => {
		const signedIn = await Auth.signIn({ email, code });
		if (signedIn.isErr() && signedIn.error.type === 'AuthInvalidCode')
			invalid({
				message: 'That code is wrong or has expired.',
				path: ['code'],
			});

		if (signedIn.isErr()) return replyFrom(signedIn);

		setSessionCookie(signedIn.value.token, signedIn.value.expiresAt);
		redirect(303, '/');
	},
);

export const signOut = form(async () => {
	const token = readSessionCookie();
	const signedOut = token ? await Auth.signOut(token) : null;
	if (signedOut?.isErr())
		withLogger('auth')((l) => l.error({ error: signedOut.error }, 'sign-out failed'));

	deleteSessionCookie();
	redirect(303, '/sign-in');
});
