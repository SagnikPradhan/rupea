/**
 * Inbound adapter for sign-in: email a code, trade it for a session cookie,
 * and sign out.
 */
import * as v from 'valibot';
import { invalid, redirect } from '@sveltejs/kit';
import { form } from '$app/server';
import * as Auth from '#lib/server/services/auth/application/auth.ts';
import { fromResult } from '#lib/server/shared/result.ts';

const Email = v.pipe(
	v.string(),
	v.transform(Auth.normalizeEmail),
	v.email('Enter a valid email address.'),
);

const RequestCode = v.object({ email: Email });

const VerifyCode = v.object({
	email: Email,
	code: v.pipe(v.string(), v.trim(), v.regex(/^\d{6}$/, 'The code is 6 digits.')),
});

/** Returns the normalised email so the code step can carry it along. */
export const requestCode = form(RequestCode, async ({ email }) => {
	return fromResult(await Auth.requestCode(email).map(() => ({ email })));
});

export const verifyCode = form(VerifyCode, async ({ email, code }) => {
	const signedIn = await Auth.signIn(email, code);
	if (signedIn.isErr() && signedIn.error.type === 'AuthInvalidCode')
		invalid({
			message: 'That code is wrong or has expired.',
			path: ['code'],
		});

	if (signedIn.isErr()) return fromResult(signedIn);
	redirect(303, '/');
});

export const signOut = form(async () => {
	await Auth.signOut();
	redirect(303, '/sign-in');
});
