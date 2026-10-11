import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { models } from '#lib/server/shared/onnx/models.ts';

export default async function globalSetup() {
	const missing = await Promise.all(
		models.map((m) =>
			access(join(resolve('data/models'), m.file)).then(
				() => [],
				() => [m.file],
			),
		),
	);
	if (missing.flat().length > 0)
		throw new Error(
			`Missing models ${missing.flat().join(', ')} in data/models. Run 'pnpm models' to download them.`,
		);

	await promisify(execFile)('node_modules/.bin/vite', ['build']);
}
