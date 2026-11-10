import { GroupRole } from '#services/ledger/application/language.ts';
import * as Groups from '#services/ledger/application/groups.ts';
import * as Refinement from '#services/refinement/application/refinement.ts';
import type { RupeaError } from '@rupea/shared/error.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';
import { transactionOf } from './shapes.ts';

const ROLE = { primary: GroupRole.Primary, evidence: GroupRole.Evidence };

const failedOf = (e: RupeaError[]) => sanitiseBatch({ succeeded: [], failed: e });

export const listSuggestions = os.listSuggestions
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

export const linkGroups = os.linkGroups
	.use(signedIn)
	.handler(async ({ input: { handle, edits } }) => {
		const linked = await inLedger({
			handle,
			action: (l) =>
				Groups.linkGroups({ ledger: l, edits: edits.map((e) => ({ ...e, role: ROLE[e.role] })) }),
		});

		return failedOf(linked);
	});

export const dismissSuggestion = os.dismissSuggestion
	.use(signedIn)
	.handler(async ({ input: { handle, fingerprint } }) => {
		await inLedger({
			handle,
			action: (l) => Refinement.dismissSuggestion({ ledger: l, fingerprint }),
		});
	});

export const listGroups = os.listGroups
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

export const renameGroup = os.renameGroup
	.use(signedIn)
	.handler(async ({ input: { handle, group, to } }) =>
		failedOf(
			await inLedger({ handle, action: (l) => Groups.renameGroup({ ledger: l, group, to }) }),
		),
	);

export const makePrimary = os.makePrimary
	.use(signedIn)
	.handler(async ({ input: { handle, group, file, line } }) =>
		failedOf(
			await inLedger({
				handle,
				action: (l) => Groups.makePrimary({ ledger: l, group, file, line }),
			}),
		),
	);
