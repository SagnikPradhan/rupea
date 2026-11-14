import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			include: ['packages/{shared,contract,server,web}/src/**/*.{ts,svelte}'],
			exclude: ['packages/*/src/**/tests/**', '**/*.d.ts', '**/database-schema.ts'],
			reporter: ['text', 'html', 'lcov'],
			thresholds: { lines: 90, branches: 80, functions: 90 },
		},
		projects: [
			'packages/server',
			'packages/shared',
			'packages/contract',
			'packages/web',
			{ test: { name: 'lint', include: ['lint/tests/*.test.ts'] } },
		],
	},
});
