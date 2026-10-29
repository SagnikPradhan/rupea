import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Groups from '#services/ledger/application/groups.ts';
import { GroupRole } from '#services/ledger/application/shared.ts';
import * as Refinement from '#services/refinement/application/refinement.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { listFiles } from './files.remote';
import { Handle, inLedger, Key } from './shared';
import { listProblems } from './ledger.remote';
import { viewGroup, viewSuggestion } from './views';

const Line = v.pipe(v.number(), v.integer(), v.minValue(1));
const GroupId = v.pipe(v.string(), v.regex(/^\S+$/, 'A group id is one word.'));
const Fingerprint = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

export const listSuggestions = query(v.object({ handle: Handle, file: Key }), ({ handle, file }) =>
	replyFrom(
		inLedger({ handle, action: (l) => Refinement.listSuggestions({ ledger: l, file }) }).map((s) =>
			s.map(viewSuggestion),
		),
	),
);

export const linkGroups = command(
	v.object({
		handle: Handle,
		edits: v.array(
			v.object({
				file: Key,
				line: Line,
				date: v.string(),
				description: v.string(),
				role: v.enum(GroupRole),
				group: GroupId,
			}),
		),
	}),
	async ({ handle, edits }) => {
		const linked = await inLedger({
			handle,
			action: (l) => Groups.linkGroups({ ledger: l, edits }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		for (const file of new Set(edits.map((e) => e.file)))
			void listSuggestions({ handle, file }).refresh();
		return replyFrom(linked);
	},
);

export const dismissSuggestion = command(
	v.object({ handle: Handle, file: Key, fingerprint: Fingerprint }),
	async ({ handle, file, fingerprint }) => {
		const dismissed = await inLedger({
			handle,
			action: (l) => Refinement.dismissSuggestion({ ledger: l, fingerprint }),
		});
		void listSuggestions({ handle, file }).refresh();
		return replyFrom(dismissed);
	},
);

export const listGroups = query(v.object({ handle: Handle, file: Key }), ({ handle, file }) =>
	replyFrom(
		inLedger({ handle, action: (l) => Groups.listGroups({ ledger: l, file }) }).map((e) =>
			e.map(viewGroup),
		),
	),
);

export const renameGroup = command(
	v.object({ handle: Handle, file: Key, group: GroupId, to: GroupId }),
	async ({ handle, file, group, to }) => {
		const renamed = await inLedger({
			handle,
			action: (l) => Groups.renameGroup({ ledger: l, group, to }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		void listGroups({ handle, file }).refresh();
		return replyFrom(renamed);
	},
);

export const makePrimary = command(
	v.object({
		handle: Handle,
		file: Key,
		group: GroupId,
		member: v.object({ file: Key, line: Line }),
	}),
	async ({ handle, file, group, member }) => {
		const made = await inLedger({
			handle,
			action: (l) => Groups.makePrimary({ ledger: l, group, ...member }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		void listGroups({ handle, file }).refresh();
		return replyFrom(made);
	},
);
