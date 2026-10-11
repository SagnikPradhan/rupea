import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const CODE_LIFETIME = 10 * 60 * 1000;
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEWAL = 15 * 24 * 60 * 60 * 1000;

export type StoredCode = { codeHash: string; expiresAt: Date };

export type SessionState =
	{ type: 'expired' } | { type: 'valid' } | { type: 'renew'; expiresAt: Date };

export const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const newCode = (now: number) => {
	const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
	return { code, stored: { codeHash: sha256(code), expiresAt: new Date(now + CODE_LIFETIME) } };
};

export const newSession = (now: number) => {
	const token = randomBytes(32).toString('base64url');
	return { token, tokenHash: sha256(token), expiresAt: new Date(now + SESSION_LIFETIME) };
};

export const codeMatches = (stored: StoredCode | null, code: string, now: number): boolean => {
	if (!stored || stored.expiresAt.getTime() < now) return false;
	const expected = Buffer.from(stored.codeHash);
	const actual = Buffer.from(sha256(code));
	return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const sessionState = (expiresAt: Date, now: number): SessionState => {
	const left = expiresAt.getTime() - now;
	if (left <= 0) return { type: 'expired' };
	if (left >= SESSION_RENEWAL) return { type: 'valid' };
	return { type: 'renew', expiresAt: new Date(now + SESSION_LIFETIME) };
};
