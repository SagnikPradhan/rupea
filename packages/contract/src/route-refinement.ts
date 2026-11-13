import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { Key, Line } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';
import { Fingerprint, Group, GroupId, LinkEdit, MOST_EDITS, Suggestion } from './shape-ledger.ts';

const listSuggestions = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/suggestions',
		operationId: 'refinement.listSuggestions',
		description: dedent`
			Lists the transactions of a file that likely match one elsewhere,
			strongest first, with the links that would group them.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, file: Key }))
	.errors(errors)
	.output(v.array(Suggestion));

const linkGroups = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/links',
		operationId: 'refinement.linkGroups',
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

const dismissSuggestion = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/dismissals/{fingerprint}',
		operationId: 'refinement.dismissSuggestion',
		description: dedent`
			Stops a suggestion from being offered again, by its fingerprint.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, fingerprint: Fingerprint }))
	.errors(errors);

const listGroups = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/groups',
		operationId: 'refinement.listGroups',
		description: dedent`
			Lists the groups with a member in a file, each with every member wherever
			it is written and whether it counts.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, file: Key }))
	.errors(errors)
	.output(v.array(Group));

const renameGroup = oc
	.route({
		method: 'PATCH',
		path: '/ledgers/{handle}/groups/{group}',
		operationId: 'refinement.renameGroup',
		description: dedent`
			Gives a group a new name in every file that names it, and answers what
			stopped it beside no successes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, group: GroupId, to: GroupId }))
	.errors(errors)
	.output(batchOf(v.never()));

const makePrimary = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/groups/{group}/primary',
		operationId: 'refinement.makePrimary',
		description: dedent`
			Makes a member the one of its group that counts, and the old primary
			evidence, and answers what stopped it beside no successes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, group: GroupId, file: Key, line: Line }))
	.errors(errors)
	.output(batchOf(v.never()));

export const refinement = {
	listSuggestions,
	linkGroups,
	dismissSuggestion,
	listGroups,
	renameGroup,
	makePrimary,
};
