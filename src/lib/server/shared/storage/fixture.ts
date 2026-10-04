/** A Vitest `it` whose tests get a fresh local `Storage` in a temp directory. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it as base } from 'vitest';
import { localStorage } from './local';
import type { Storage } from './storage';

export const it = base.extend<{ root: string; storage: Storage }>({
	// Vitest reads the fixtures a test uses from this destructuring.
	root: async ({}, use) => {
		const root = await mkdtemp(join(tmpdir(), 'rupee-'));
		await use(root);
		await rm(root, { recursive: true, force: true });
	},
	storage: async ({ root }, u) => u(localStorage(root)),
});
