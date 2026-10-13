import * as v from 'valibot';
import { invalid, redirect } from '@sveltejs/kit';
import { form } from '$app/server';
import * as Auth from '#services/auth/application/auth.ts';
import { replyFrom } from '#lib/server/shared/result/reply.ts';

const Email = v.pipe(
	v.string(),
	v.transform(Auth.normalizeEmail),
	v.email('Enter a valid email address.'),
);

/** Returns the normalised email so the code step can carry it. */
export const requestCode = form(v.object({ email: Email }), async ({ email }) => {
	return replyFrom(await Auth.requestCode(email).map(() => ({ email })));
});

export const verifyCode = form(
	v.object({
		email: Email,
		code: v.pipe(v.string(), v.trim(), v.regex(/^\d{6}$/, 'The code is 6 digits.')),
	}),
	async ({ email, code }) => {
		const signedIn = await Auth.signIn(email, code);
		if (signedIn.isErr() && signedIn.error.type === 'AuthInvalidCode')
			invalid({
				message: 'That code is wrong or has expired.',
				path: ['code'],
			});

		if (signedIn.isErr()) return replyFrom(signedIn);
		redirect(303, '/');
	},
);

export const signOut = form(async () => {
	await Auth.signOut();
	redirect(303, '/sign-in');
});
