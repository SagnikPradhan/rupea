import { sql, type Expression, type SqlBool } from 'kysely';
import { literalLike } from './index';

type ArrayType = 'text' | 'uuid';

/** Like `in`, but a list of any length is one parameter, and an empty list matches nothing. */
export const anyOf = (c: Expression<string>, v: string[], t: ArrayType) =>
	sql<SqlBool>`${c} = any(${v}::${sql.raw(t)}[])`;

/** Like `not in`, but a list of any length is one parameter, and an empty list excludes nothing. */
export const noneOf = (c: Expression<string>, v: string[], t: ArrayType) =>
	sql<SqlBool>`${c} <> all(${v}::${sql.raw(t)}[])`;

/** Rows whose column contains the text anywhere, ignoring case, or every row when there is no text. */
export const containing = (c: Expression<string>, t: string | null) =>
	t !== null ? sql<SqlBool>`${c} ilike '%' || ${literalLike(t)} || '%'` : sql<SqlBool>`true`;

/** Rows whose tuple sorts before these values, or every row when there are none. */
export const before = (c: Expression<unknown>, v: unknown[] | null) =>
	v !== null ? sql<SqlBool>`${c} < (${sql.join(v)})` : sql<SqlBool>`true`;

/** Rows whose tuple sorts before or at these values, or every row when there are none. */
export const atOrBefore = (c: Expression<unknown>, v: unknown[] | null) =>
	v !== null ? sql<SqlBool>`${c} <= (${sql.join(v)})` : sql<SqlBool>`true`;

/** How far apart two pgvector values are, for ordering by the nearest. */
export const distance = (a: Expression<unknown>, b: Expression<unknown>) =>
	sql<number>`${a} <=> ${b}`;

/** The sum of a column, or zero when there are no rows. A condition limits it to the rows where it holds. */
export const total = (c: Expression<bigint | null>, w?: Expression<SqlBool>) =>
	w === undefined
		? sql<bigint>`coalesce(sum(${c}), 0)`
		: sql<bigint>`coalesce(sum(${c}) filter (where ${w}), 0)`;

/** The distinct values of a column in the rows where a condition holds, or none. */
export const distinctOf = <T>(c: Expression<T | null>, w: Expression<SqlBool>) =>
	sql<T[]>`coalesce(array_agg(distinct ${c}) filter (where ${w}), '{}')`;

/** The distinct "a:b" labels of the rows, or none. */
export const labels = (a: Expression<unknown>, b: Expression<unknown>) =>
	sql<string[]>`coalesce(array_agg(distinct ${a} || ':' || ${b}), '{}')`;

/** The sum of a column over the rows on days before each one's, restarting for each partition. A condition limits it to the rows where it holds. */
export const totalBefore = (
	c: Expression<bigint | null>,
	p: Expression<unknown>[],
	o: Expression<string>,
	w: Expression<SqlBool>,
) =>
	sql<bigint>`coalesce(sum(${c}) filter (where ${w}) over (partition by ${sql.join(p)} order by ${o} range between unbounded preceding and '1 day' preceding), 0)`;

/** The first day of the month a date falls in. */
export const monthOf = (d: Expression<string>) => sql<string>`date_trunc('month', ${d})::date`;

/** The sum of a column up to each row, restarting for each partition and counting in order. */
export const runningTotal = (
	c: Expression<bigint | null>,
	p: Expression<unknown>[],
	o: Expression<unknown>,
) => sql<bigint>`sum(coalesce(${c}, 0)) over (partition by ${sql.join(p)} order by ${o})`;

/** How many distinct keys have a row with no value in a column, as an integer. */
export const unset = (c: Expression<unknown>, k: Expression<unknown>) =>
	sql<number>`(count(distinct ${k}) filter (where ${c} is null))::integer`;

/** A value for a jsonb column, which the driver would otherwise send as a Postgres array when it is one. */
export const json = <T>(v: T) => sql<T>`${JSON.stringify(v)}::jsonb`;
