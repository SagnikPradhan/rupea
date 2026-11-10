import { oc } from '@orpc/contract';
import { Key, Line } from '@rupea/shared/files.ts';
import { Fingerprint, GroupId, LinkEdit, LinkTarget, Role } from '@rupea/shared/groups.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const Handle = v.string();

const MOST_EDITS = 10_000;

const Suggestion = v.object({
	fingerprint: v.string(),
	confidence: v.picklist(['duplicate', 'possible']),
	group: v.nullable(v.string()),
	ours: TransactionOut,
	theirs: TransactionOut,
	links: v.array(LinkTarget),
});

const Group = v.object({
	group: v.string(),
	members: v.array(v.object({ role: Role, counted: v.boolean(), ...TransactionOut.entries })),
});

/**
 * The transactions of a file that likely match one elsewhere, strongest first,
 * and the links that would group them.
 */
export const listSuggestions = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/suggestions',
		operationId: 'listSuggestions',
	})
	.input(v.object({ handle: Handle, file: Key }))
	.errors(errors)
	.output(v.array(Suggestion));

/**
 * Writes the links of the edits into their files, and answers what stopped it
 * beside no successes.
 */
export const linkGroups = oc
	.route({ method: 'POST', path: '/ledgers/{handle}/links', operationId: 'linkGroups' })
	.input(
		v.object({
			handle: Handle,
			edits: v.pipe(v.array(LinkEdit), v.minLength(1), v.maxLength(MOST_EDITS)),
		}),
	)
	.errors(errors)
	.output(batchOf(v.never()));

/** Stops a suggestion from being offered again. */
export const dismissSuggestion = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/dismissals/{fingerprint}',
		operationId: 'dismissSuggestion',
	})
	.input(v.object({ handle: Handle, fingerprint: Fingerprint }))
	.errors(errors);

/** The groups with a member in a file, with every member wherever it is written. */
export const listGroups = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/groups', operationId: 'listGroups' })
	.input(v.object({ handle: Handle, file: Key }))
	.errors(errors)
	.output(v.array(Group));

/** Gives a group a new name in every file that names it. */
export const renameGroup = oc
	.route({
		method: 'PATCH',
		path: '/ledgers/{handle}/groups/{group}',
		operationId: 'renameGroup',
	})
	.input(v.object({ handle: Handle, group: GroupId, to: GroupId }))
	.errors(errors)
	.output(batchOf(v.never()));

/**
 * Makes a member the one of its group that counts, and the old primary
 * evidence.
 */
export const makePrimary = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/groups/{group}/primary',
		operationId: 'makePrimary',
	})
	.input(v.object({ handle: Handle, group: GroupId, file: Key, line: Line }))
	.errors(errors)
	.output(batchOf(v.never()));
