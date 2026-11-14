import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		name: 'backend',
		// Reading a PDF runs the models on several threads; a worker per core leaves them none.
		maxWorkers: '50%',
		sequence: { groupOrder: 1 },
		include: ['src/services/*/tests/*.test.ts', 'src/tests/*.test.ts'],
		benchmark: { include: ['src/**/tests/*.bench.ts'] },
		globalSetup: ['tests/shared/postgres.ts'],
	},
});
