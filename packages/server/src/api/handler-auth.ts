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
	if (context.token) await answer(Auth.signOut(context.token));
});

const findUser = os.auth.findUser.use(signedInRenewing).handler(({ context }) => {
	const { user, expiresAt, extended } = context.session;
	return { user, expiresAt: extended && expiresAt ? expiresAt.toTemporalInstant() : null };
});

const saveUsername = os.auth.saveUsername
	.use(signedIn)
	.handler(({ input }) => answer(Auth.saveUsername(input.username)));

const requestEmailCode = os.auth.requestEmailCode.use(signedIn).handler(async ({ input }) => {
	await answer(Auth.requestEmailCode(input.email));
});

const saveEmail = os.auth.saveEmail
	.use(signedIn)
	.handler(({ input }) => answer(Auth.saveEmail({ email: input.email, code: input.code ?? '' })));

export const auth = {
	requestCode,
	signIn,
	signOut,
	findUser,
	saveUsername,
	requestEmailCode,
	saveEmail,
};
