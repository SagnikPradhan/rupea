import { connectDatabase } from '#lib/server/db/index.ts';
import { startServer } from 'portable-pg';
import type { TestProject } from 'vitest/node';
import { TEMPLATE, admin, at } from './database.ts';

declare module 'vitest' {
	export interface ProvidedContext {
		postgres: string;
	}
}

// Test data needs no durability, and without it each copy of the template is cheap.
const SETTINGS = { fsync: 'off', synchronous_commit: 'off', full_page_writes: 'off' };

export default async (project: TestProject) => {
	const server = await startServer({ settings: SETTINGS });
	await admin(server.url, `create database ${TEMPLATE}`);

	const url = at(server.url, TEMPLATE);
	const template = await connectDatabase(url);
	await template.migrate();
	await template.close();

	project.provide('postgres', server.url);
	return server.stop;
};
