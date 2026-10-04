import { existsSync } from 'node:fs';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-sqlite/config';

if (existsSync('.env')) process.loadEnvFile();

export default definePrismaConfig({
	orm: ormConfig({
		contract: './prisma/contract.prisma',
		output: './src/lib/server/db/generated',
		db: {
			connection: process.env['DATABASE_PATH'] ?? './data/rupee.db',
		},
		migrations: {
			dir: './prisma/migrations',
		},
	}),
});
