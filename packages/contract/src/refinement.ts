import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { Key, Line } from '@rupea/shared/files.ts';
import { Fingerprint, GroupId, LinkEdit, MOST_EDITS } from '@rupea/shared/groups.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';
import { Group, Suggestion } from './outputs.ts';

export const listSuggestions = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/suggestions',
		operationId: 'listSuggestions',
		description: dedent`
			Lists the transactions of a file that likely match one elsewhere,
			strongest first, with the links that would group them.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, file: Key }))
	.errors(errors)
	.output(v.array(Suggestion));

export const linkGroups = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/links',
		operationId: 'linkGroups',
		description: dedent`
			Writes the links of the edits into their files and answers what stopped
			it, beside no successes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(
		v.object({
			handle: Handle,
			edits: v.pipe(v.array(LinkEdit), v.minLength(1), v.maxLength(MOST_EDITS)),
		}),
	)
	.errors(errors)
	.output(batchOf(v.never()));

export const dismissSuggestion = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/dismissals/{fingerprint}',
		operationId: 'dismissSuggestion',
		description: dedent`
			Stops a suggestion from being offered again, by its fingerprint.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, fingerprint: Fingerprint }))
	.errors(errors);

export const listGroups = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/groups',
		operationId: 'listGroups',
		description: dedent`
			Lists the groups with a member in a file, each with every member wherever
			it is written and whether it counts.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, file: Key }))
	.errors(errors)
	.output(v.array(Group));

export const renameGroup = oc
	.route({
		method: 'PATCH',
		path: '/ledgers/{handle}/groups/{group}',
		operationId: 'renameGroup',
		description: dedent`
			Gives a group a new name in every file that names it, and answers what
			stopped it beside no successes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, group: GroupId, to: GroupId }))
	.errors(errors)
	.output(batchOf(v.never()));

export const makePrimary = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/groups/{group}/primary',
		operationId: 'makePrimary',
		description: dedent`
			Makes a member the one of its group that counts, and the old primary
			evidence, and answers what stopped it beside no successes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, group: GroupId, file: Key, line: Line }))
	.errors(errors)
	.output(batchOf(v.never()));
