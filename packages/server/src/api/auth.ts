import * as Auth from '#services/auth/application/auth.ts';
import { answer } from './answer.ts';
import { os, signedIn, signedInRenewing } from './session.ts';

export const requestCode = os.requestCode.handler(async ({ input }) => {
	await answer(Auth.requestCode(input.email));
});

export const signIn = os.signIn.handler(async ({ input }) => {
	const { token, expiresAt } = await answer(Auth.signIn(input));
	return { token, expiresAt: expiresAt.toTemporalInstant() };
});

export const signOut = os.signOut.use(signedIn).handler(async ({ context }) => {
	await answer(Auth.signOut(context.token));
});

export const findUser = os.findUser.use(signedInRenewing).handler(({ context }) => {
	const { user, expiresAt, extended } = context.session;
	return { user, expiresAt: extended ? expiresAt.toTemporalInstant() : null };
});
