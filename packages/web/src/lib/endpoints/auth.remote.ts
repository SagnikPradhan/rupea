import { Email } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { invalid, redirect } from '@sveltejs/kit';
import { form } from '$app/server';
import { api } from './api';
import { replyFromCall } from './reply';
import { deleteSessionCookie, readSessionCookie, setSessionCookie } from './session';

/** Returns the normalised email so the code step can carry it. */
export const requestCode = form(v.object({ email: Email }), ({ email }) =>
	replyFromCall(
		api()
			.auth.requestCode({ email })
			.then(() => ({ email })),
	),
);

export const verifyCode = form(
	v.object({
		email: Email,
		code: v.pipe(v.string(), v.trim(), v.regex(/^\d{6}$/, 'The code is 6 digits.')),
	}),
	async ({ email, code }) => {
		const signedIn = await replyFromCall(api().auth.signIn({ email, code }));
		if (signedIn.errors[0]?.type === 'AuthInvalidCode')
			invalid({
				message: 'That code is wrong or has expired.',
				path: ['code'],
			});

		if (!signedIn.data) return signedIn;

		setSessionCookie(signedIn.data.token, signedIn.data.expiresAt);
		redirect(303, '/');
	},
);

export const signOut = form(async () => {
	const token = readSessionCookie();
	const signedOut = token ? await replyFromCall(api().auth.signOut()) : null;
	const error = signedOut?.errors.find((e) => e.type !== 'AuthUnauthenticated');
	if (error) console.error('sign-out failed', error);

	deleteSessionCookie();
	redirect(303, '/sign-in');
});
