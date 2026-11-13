import { createClient } from '#lib/endpoints/api.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const answer = { user: { id: 'u1', email: 'ada@example.com', username: 'ada' }, expiresAt: null };

const fetchSeen = () => {
	const seen: Request[] = [];
	const fetch = (request: Request) => {
		seen.push(request);
		return Promise.resolve(Response.json(answer));
	};
	return { seen, fetch };
};

describe('the API client', () => {
	it('calls the route of the contract under the base URL, sending the token as a bearer', async () => {
		const { seen, fetch } = fetchSeen();
		const client = createClient({ url: 'http://api.test/api', token: 'opaque', fetch });

		expect(await client.findUser()).toEqual(answer);

		expect(seen[0]?.url).toBe('http://api.test/api/auth/user');
		expect(seen[0]?.method).toBe('GET');
		expect(seen[0]?.headers.get('authorization')).toBe('Bearer opaque');
	});

	it('sends no authorization without a token', async () => {
		const { seen, fetch } = fetchSeen();
		const client = createClient({ url: 'http://api.test/api', token: null, fetch });

		await client.findUser();

		expect(seen[0]?.headers.has('authorization')).toBe(false);
	});
});
