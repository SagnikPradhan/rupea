import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { models } from '@rupea/server/shared/onnx/models.ts';

export default async function globalSetup() {
	const missing = await Promise.all(
		models.map((m) =>
			access(join(resolve('../server/data/models'), m.file)).then(
				() => [],
				() => [m.file],
			),
		),
	);
	if (missing.flat().length > 0)
		throw new Error(
			`Missing models ${missing.flat().join(', ')} in packages/server/data/models. Run 'pnpm --filter @rupea/server models' to download them.`,
		);

	const build = (...args: string[]) =>
		promisify(execFile)('node_modules/.bin/vite', ['build', ...args]);
	await Promise.all([build(), build('--config', '../server/vite.config.ts')]);
}
