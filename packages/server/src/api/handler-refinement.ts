import { GroupRole } from '#services/ledger/application/language.ts';
import * as Groups from '#services/ledger/application/groups.ts';
import * as Refinement from '#services/refinement/application/refinement.ts';
import type { RupeaError } from '@rupea/shared/error.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';
import { transactionOf } from './shapes.ts';

const ROLE = { primary: GroupRole.Primary, evidence: GroupRole.Evidence };

const failedOf = (e: RupeaError[]) => sanitiseBatch({ succeeded: [], failed: e });

const listSuggestions = os.refinement.listSuggestions
	.use(signedIn)
	.handler(async ({ input: { handle, file } }) => {
		const suggestions = await inLedger({
			handle,
			action: (l) => Refinement.listSuggestions({ ledger: l, file }),
		});

		return suggestions.map((s) => ({
			...s,
			ours: transactionOf(s.ours),
			theirs: transactionOf(s.theirs),
		}));
	});

const linkGroups = os.refinement.linkGroups
	.use(signedIn)
	.handler(async ({ input: { handle, edits } }) => {
		const linked = await inLedger({
			handle,
			action: (l) =>
				Groups.linkGroups({ ledger: l, edits: edits.map((e) => ({ ...e, role: ROLE[e.role] })) }),
		});

		return failedOf(linked);
	});

const dismissSuggestion = os.refinement.dismissSuggestion
	.use(signedIn)
	.handler(async ({ input: { handle, fingerprint } }) => {
		await inLedger({
			handle,
			action: (l) => Refinement.dismissSuggestion({ ledger: l, fingerprint }),
		});
	});

const listGroups = os.refinement.listGroups
	.use(signedIn)
	.handler(async ({ input: { handle, file } }) => {
		const groups = await inLedger({
			handle,
			action: (l) => Groups.listGroups({ ledger: l, file }),
		});

		return groups.map((g) => ({
			group: g.group,
			members: g.members.map((m) => ({ role: m.role, counted: m.counted, ...transactionOf(m) })),
		}));
	});

const renameGroup = os.refinement.renameGroup
	.use(signedIn)
	.handler(async ({ input: { handle, group, to } }) =>
		failedOf(
			await inLedger({ handle, action: (l) => Groups.renameGroup({ ledger: l, group, to }) }),
		),
	);

const makePrimary = os.refinement.makePrimary
	.use(signedIn)
	.handler(async ({ input: { handle, group, file, line } }) =>
		failedOf(
			await inLedger({
				handle,
				action: (l) => Groups.makePrimary({ ledger: l, group, file, line }),
			}),
		),
	);

export const refinement = {
	listSuggestions,
	linkGroups,
	dismissSuggestion,
	listGroups,
	renameGroup,
	makePrimary,
};
