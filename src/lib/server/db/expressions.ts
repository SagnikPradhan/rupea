import { sql, type Expression, type SqlBool } from 'kysely';

type ArrayType = 'text' | 'uuid';

/** Like `in`, but a list of any length is one parameter, and an empty list matches nothing. */
export const anyOf = (c: Expression<string>, v: string[], t: ArrayType) =>
	sql<SqlBool>`${c} = any(${v}::${sql.raw(t)}[])`;

/** Like `not in`, but a list of any length is one parameter, and an empty list excludes nothing. */
export const noneOf = (c: Expression<string>, v: string[], t: ArrayType) =>
	sql<SqlBool>`${c} <> all(${v}::${sql.raw(t)}[])`;

/** How far apart two pgvector values are, for ordering by the nearest. */
export const distance = (a: Expression<unknown>, b: Expression<unknown>) =>
	sql<number>`${a} <=> ${b}`;

/** The sum of a column, or zero when there are no rows. A condition limits it to the rows where it holds. */
export const total = (c: Expression<bigint | null>, w?: Expression<SqlBool>) =>
	w === undefined
		? sql<bigint>`coalesce(sum(${c}), 0)`
		: sql<bigint>`coalesce(sum(${c}) filter (where ${w}), 0)`;

/** The distinct "a:b" labels of the rows where a condition holds, or none. */
export const labels = (a: Expression<unknown>, b: Expression<unknown>, w: Expression<SqlBool>) =>
	sql<string[]>`coalesce(array_agg(distinct ${a} || ':' || ${b}) filter (where ${w}), '{}')`;

/** The sum of a column over the rows on days before each one's, restarting for each partition. A condition limits it to the rows where it holds. */
export const totalBefore = (
	c: Expression<bigint | null>,
	p: Expression<unknown>[],
	o: Expression<string>,
	w: Expression<SqlBool>,
) =>
	sql<bigint>`coalesce(sum(${c}) filter (where ${w}) over (partition by ${sql.join(p)} order by ${o} range between unbounded preceding and '1 day' preceding), 0)`;

/** The sum of a column up to each row, restarting for each partition and counting in order. */
export const runningTotal = (
	c: Expression<bigint | null>,
	p: Expression<unknown>[],
	o: Expression<unknown>,
) => sql<bigint>`sum(coalesce(${c}, 0)) over (partition by ${sql.join(p)} order by ${o})`;

/** How many rows have a key but no value in a column, as an integer. */
export const unset = (c: Expression<unknown>, k: Expression<unknown>) =>
	sql<number>`(count(${k}) filter (where ${c} is null))::integer`;

/** A value for a jsonb column, which the driver would otherwise send as a Postgres array when it is one. */
export const json = <T>(v: T) => sql<T>`${JSON.stringify(v)}::jsonb`;
