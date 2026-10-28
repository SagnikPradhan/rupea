import { expect, vi } from 'vitest';

/** Writes until `seen` holds, since a watch starts listening some time after it is first asked. */
export const untilSeen = (write: () => unknown, seen: () => boolean) =>
	vi.waitFor(
		async () => {
			await write();
			expect(seen()).toBe(true);
		},
		{ timeout: 10_000, interval: 50 },
	);
