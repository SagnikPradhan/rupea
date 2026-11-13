import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/services/*/adapters/database-schema.ts',
	out: './drizzle',
	casing: 'snake_case',
});
