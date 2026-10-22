import { sql, type SqlBool } from 'kysely';

type ArrayType = 'text' | 'uuid';

/** Like `in`, but a list of any length is one parameter, and an empty list matches nothing. */
export const anyOf = (c: string, v: string[], t: ArrayType) =>
	sql<SqlBool>`${sql.ref(c)} = any(${v}::${sql.raw(t)}[])`;

/** Like `not in`, but a list of any length is one parameter, and an empty list excludes nothing. */
export const noneOf = (c: string, v: string[], t: ArrayType) =>
	sql<SqlBool>`${sql.ref(c)} <> all(${v}::${sql.raw(t)}[])`;

/** How far apart two pgvector values are, for ordering by the nearest. */
export const distance = (a: string, b: string) => sql<number>`${sql.ref(a)} <=> ${sql.ref(b)}`;
