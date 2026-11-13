import { Linter } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageBoundaries } from '../package-boundaries.ts';

const linter = new Linter();

/** ESLint's types do not accept a rule built with its TypeScript helpers. */
const rule = packageBoundaries as never;
const config = (options: object): Linter.Config[] => [
	{
		files: ['**/*.ts'],
		plugins: { rupea: { rules: { 'package-boundaries': rule } } },
		rules: { 'rupea/package-boundaries': ['error', options] },
	},
];

const messages = (path: string, code: string, options = {}) =>
	linter.verify(code, config(options), join(process.cwd(), path)).map((m) => m.message);

describe('package boundaries', () => {
	it('finds the packages from the file, not from where eslint started', () =>
		expect(
			new Linter({ cwd: join(process.cwd(), 'packages') })
				.verify(
					"import a from '#services/auth/application/auth.ts';",
					config({}),
					join(process.cwd(), 'packages/server/src/server.ts'),
				)
				.map((m) => m.message),
		).toEqual([]));

	it('lets shared import its own files', () =>
		expect(messages('packages/shared/src/dates.ts', "import a from './text';")).toEqual([]));

	it('lets the server import shared and its own aliases', () => {
		expect(
			messages('packages/server/src/db/index.ts', "import a from '@rupea/shared/errors.ts';"),
		).toEqual([]);
		expect(
			messages(
				'packages/server/src/db/index.ts',
				"import a from '#services/auth/application/auth.ts';",
			),
		).toEqual([]);
	});

	it('lets the contract import shared, and the server and the web app import the contract', () => {
		expect(
			messages(
				'packages/contract/src/route-accounts.ts',
				"import a from '@rupea/shared/dates.ts';",
			),
		).toEqual([]);
		expect(
			messages(
				'packages/server/src/api/handler-accounts.ts',
				"import a from '@rupea/contract/contract.ts';",
			),
		).toEqual([]);
		expect(
			messages(
				'packages/web/src/lib/web/shared/format.ts',
				"import a from '@rupea/contract/contract.ts';",
			),
		).toEqual([]);
	});

	it('lets the web app import shared, itself and framework modules', () => {
		expect(
			messages(
				'packages/web/src/lib/web/shared/format.ts',
				"import a from '@rupea/shared/dates.ts';",
			),
		).toEqual([]);
		expect(
			messages(
				'packages/web/src/lib/web/shared/format.ts',
				"import a from '#lib/web/shared/chart.ts';",
			),
		).toEqual([]);
		expect(
			messages('packages/web/src/lib/web/shared/format.ts', "import a from '$app/state';"),
		).toEqual([]);
	});

	it('leaves the site and the theme alone', () =>
		expect(
			messages('packages/site/src/pages/index.ts', "import a from '@rupea/server/db/index.ts';"),
		).toEqual([]));

	it('lets the end-to-end support import the server where allowed', () =>
		expect(
			messages(
				'packages/web/tests/e2e/support/server.ts',
				"import a from '@rupea/server/server.ts';",
				{
					allowServer: true,
				},
			),
		).toEqual([]));

	it('stops shared importing the server or the web app', () => {
		expect(
			messages('packages/shared/src/dates.ts', "import a from '@rupea/server/db/index.ts';"),
		).toEqual(['The shared code must not import server code (@rupea/server/db/index.ts)']);
		expect(
			messages(
				'packages/shared/src/dates.ts',
				"import a from '../../web/src/lib/web/shared/format.ts';",
			),
		).toHaveLength(1);
	});

	it('stops shared importing the contract', () =>
		expect(
			messages('packages/shared/src/dates.ts', "import a from '@rupea/contract/contract.ts';"),
		).toEqual(['The shared code must not import contract code (@rupea/contract/contract.ts)']));

	it('stops the contract importing the server or the web app', () => {
		expect(
			messages(
				'packages/contract/src/route-accounts.ts',
				"import a from '@rupea/server/db/index.ts';",
			),
		).toEqual(['The contract code must not import server code (@rupea/server/db/index.ts)']);
		expect(
			messages(
				'packages/contract/src/route-accounts.ts',
				"import a from '#lib/web/shared/format.ts';",
			),
		).toHaveLength(1);
	});

	it('stops the server importing the web app, however it imports', () => {
		expect(
			messages('packages/server/src/db/index.ts', "import a from '#lib/web/shared/format.ts';"),
		).toHaveLength(1);
		expect(
			messages(
				'packages/server/src/db/index.ts',
				"export { a } from '#routes/sign-in/+page.svelte';",
			),
		).toHaveLength(1);
		expect(
			messages(
				'packages/server/src/db/index.ts',
				"const a = await import('#lib/endpoints/auth.remote.ts');",
			),
		).toHaveLength(1);
	});

	it('stops the web app importing the server unless allowed', () => {
		expect(
			messages(
				'packages/web/src/lib/web/shared/format.ts',
				"import a from '@rupea/server/db/index.ts';",
			),
		).toHaveLength(1);
		expect(
			messages(
				'packages/web/src/lib/web/shared/format.ts',
				"import a from '#services/auth/application/auth.ts';",
			),
		).toHaveLength(1);
	});

	it('stops shared importing the web framework or the lib index', () => {
		const shared = 'packages/shared/src/dates.ts';
		const framework = (source: string) =>
			`Shared code must not import the web framework (${source})`;

		expect(messages(shared, "import a from '$app/state';")).toEqual([framework('$app/state')]);
		expect(messages(shared, "import a from '@sveltejs/kit';")).toEqual([
			framework('@sveltejs/kit'),
		]);
		expect(messages(shared, "import a from 'svelte/store';")).toEqual([framework('svelte/store')]);
		expect(messages(shared, "import a from '#lib';")).toEqual([framework('#lib')]);
		expect(messages(shared, "import a from '#lib/index.ts';")).toEqual([
			framework('#lib/index.ts'),
		]);
		expect(messages(shared, "import a from 'svelte-check';")).toEqual([]);
	});

	it('lets the server and the web app import the framework', () => {
		expect(messages('packages/server/src/db/index.ts', "import a from '$app/server';")).toEqual([]);
		expect(
			messages('packages/web/src/lib/web/shared/format.ts', "import a from 'svelte';"),
		).toEqual([]);
	});
});
