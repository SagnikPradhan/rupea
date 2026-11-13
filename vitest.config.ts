import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Reading a PDF runs the models on several threads; a worker per core leaves them none.
		maxWorkers: '50%',
		coverage: {
			include: ['packages/{shared,contract,server}/src/**/*.{ts,svelte}'],
			exclude: ['packages/*/src/**/tests/**', '**/*.d.ts', '**/database-schema.ts'],
			reporter: ['text', 'html', 'lcov'],
			thresholds: { lines: 90, branches: 80, functions: 90 },
		},
		projects: [
			{
				test: {
					name: 'backend',
					include: [
						'packages/server/src/services/*/tests/*.test.ts',
						'packages/server/src/tests/*.test.ts',
					],
					benchmark: { include: ['packages/server/src/**/tests/*.bench.ts'] },
					environment: 'node',
					globalSetup: ['packages/server/tests/shared/postgres.ts'],
				},
			},
			{
				test: { name: 'shared', include: ['packages/shared/tests/*.test.ts'], environment: 'node' },
			},
			{
				test: {
					name: 'contract',
					include: ['packages/contract/tests/*.test.ts'],
					environment: 'node',
				},
			},
			{
				test: { name: 'lint', include: ['lint/tests/*.test.ts'], environment: 'node' },
			},
		],
	},
});
