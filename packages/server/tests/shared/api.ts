import * as Auth from '#services/auth/adapters/database.ts';
import { newSession } from '#services/auth/domain/credentials.ts';

/** The header of a request signed in as this user. */
export const bearerOf = async (user: string) => {
	const session = newSession(Date.now());
	await Auth.createSession({
		tokenHash: session.tokenHash,
		userId: user,
		expiresAt: session.expiresAt,
	});
	return { authorization: `Bearer ${session.token}` };
};

/** A body and header that send a form as multipart, as a client would. */
export const multipart = async (form: FormData) => {
	const encoded = new Response(form);

	return {
		payload: Buffer.from(await encoded.arrayBuffer()),
		headers: { 'content-type': encoded.headers.get('content-type') ?? '' },
	};
};
