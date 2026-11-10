import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './packages/server/src/services/*/adapters/database-schema.ts',
	out: './drizzle',
	casing: 'snake_case',
});
