import sqlite from '@prisma/orm-sqlite/runtime';
import type { Contract } from './generated/contract.d';
import contractJson from './generated/contract.json' with { type: 'json' };

export const openDatabase = (p: string) => sqlite<Contract>({ contractJson, path: p });

export type Database = ReturnType<typeof openDatabase>;

type Enums = Contract['domain']['namespaces']['__unbound__']['enum'];

/**
 * The values of a schema enum. SQLite has no enum columns, so the ORM types
 * them as plain strings; this keeps code honest about the allowed values.
 */
export type Enum<Name extends keyof Enums> = Enums[Name]['members'][number]['value'];
