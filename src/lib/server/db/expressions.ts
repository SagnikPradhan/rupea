import { sql, type Expression, type SqlBool } from 'kysely';

type ArrayType = 'text' | 'uuid';

/** Like `in`, but a list of any length is one parameter, and an empty list matches nothing. */
export const anyOf = (c: string, v: string[], t: ArrayType) =>
	sql<SqlBool>`${sql.ref(c)} = any(${v}::${sql.raw(t)}[])`;

/** Like `not in`, but a list of any length is one parameter, and an empty list excludes nothing. */
export const noneOf = (c: string, v: string[], t: ArrayType) =>
	sql<SqlBool>`${sql.ref(c)} <> all(${v}::${sql.raw(t)}[])`;

/** How far apart two pgvector values are, for ordering by the nearest. */
export const distance = (a: string, b: string) => sql<number>`${sql.ref(a)} <=> ${sql.ref(b)}`;

/** The sum of a column, or zero when there are no rows. A flag column or condition limits it to the rows where it holds. */
export const total = (c: string, w?: string | Expression<SqlBool>) =>
	w === undefined
		? sql<bigint>`coalesce(sum(${sql.ref(c)}), 0)`
		: sql<bigint>`coalesce(sum(${sql.ref(c)}) filter (where ${typeof w === 'string' ? sql.ref(w) : w}), 0)`;

/** The distinct "a:b" labels of the rows where a condition holds, or none. */
export const labels = (a: string, b: string, w: Expression<SqlBool>) =>
	sql<
		string[]
	>`coalesce(array_agg(distinct ${sql.ref(a)} || ':' || ${sql.ref(b)}) filter (where ${w}), '{}')`;

/** The sum of a column over the rows before each one, restarting for each partition and counting in order. */
export const totalBefore = (c: string, g: string[], o: string) =>
	sql<bigint>`sum(${sql.ref(c)}) over (partition by ${sql.join(g.map((p) => sql.ref(p)))} order by ${sql.ref(o)}) - ${sql.ref(c)}`;

/** The sum of a column up to each row, restarting for each partition and counting in order. */
export const runningTotal = (c: string, g: string[], o: string) =>
	sql<bigint>`sum(coalesce(${sql.ref(c)}, 0)) over (partition by ${sql.join(g.map((p) => sql.ref(p)))} order by ${sql.ref(o)})`;

/** How many rows have a key but no value in a column, as an integer. */
export const unset = (c: string, k: string) =>
	sql<number>`(count(${sql.ref(k)}) filter (where ${sql.ref(c)} is null))::integer`;
