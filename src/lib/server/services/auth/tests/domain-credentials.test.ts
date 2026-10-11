import { describe, expect, it } from 'vitest';
import {
	codeMatches,
	newCode,
	newSession,
	normalizeEmail,
	sessionState,
	sha256,
} from '#services/auth/domain/credentials.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-01T00:00:00Z');

describe('sign-in codes', () => {
	it('are six digits, stored only as a hash', () => {
		const fresh = newCode(now);
		expect(fresh.code).toMatch(/^\d{6}$/);
		expect(fresh.stored.codeHash).toBe(sha256(fresh.code));
	});

	it('match until they expire', () => {
		const fresh = newCode(now);
		expect(codeMatches(fresh.stored, fresh.code, now)).toBe(true);
		expect(codeMatches(fresh.stored, fresh.code, now + DAY)).toBe(false);
	});

	it('do not match another code, or none stored', () => {
		const fresh = newCode(now);
		const other = fresh.code === '000000' ? '000001' : '000000';
		expect(codeMatches(fresh.stored, other, now)).toBe(false);
		expect(codeMatches(null, fresh.code, now)).toBe(false);
	});
});

describe('sessions', () => {
	it('store the hash of their token', () => {
		const session = newSession(now);
		expect(session.tokenHash).toBe(sha256(session.token));
		expect(session.expiresAt.getTime()).toBe(now + 30 * DAY);
	});

	it('stay valid in the first half of their lifetime', () => {
		expect(sessionState(new Date(now + 20 * DAY), now)).toEqual({ type: 'valid' });
	});

	it('renew in the second half', () => {
		expect(sessionState(new Date(now + 10 * DAY), now)).toEqual({
			type: 'renew',
			expiresAt: new Date(now + 30 * DAY),
		});
	});

	it('expire at their expiry', () => {
		expect(sessionState(new Date(now), now)).toEqual({ type: 'expired' });
	});
});

it('normalises emails to trimmed lower case', () => {
	expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com');
});
