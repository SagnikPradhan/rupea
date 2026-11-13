import * as Auth from '#services/auth/application/auth.ts';
import { answer } from './answer.ts';
import { os, signedIn, signedInRenewing } from './session.ts';

const requestCode = os.auth.requestCode.handler(async ({ input }) => {
	await answer(Auth.requestCode(input.email));
});

const signIn = os.auth.signIn.handler(async ({ input }) => {
	const { token, expiresAt } = await answer(Auth.signIn(input));
	return { token, expiresAt: expiresAt.toTemporalInstant() };
});

const signOut = os.auth.signOut.use(signedIn).handler(async ({ context }) => {
	await answer(Auth.signOut(context.token));
});

const findUser = os.auth.findUser.use(signedInRenewing).handler(({ context }) => {
	const { user, expiresAt, extended } = context.session;
	return { user, expiresAt: extended ? expiresAt.toTemporalInstant() : null };
});

export const auth = {
	requestCode,
	signIn,
	signOut,
	findUser,
};
