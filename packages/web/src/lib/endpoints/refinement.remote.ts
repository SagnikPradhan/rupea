import { Key, Line } from '@rupea/shared/files.ts';
import { Fingerprint, GroupId, LinkEdit, MOST_EDITS } from '@rupea/shared/groups.ts';
import { Handle } from '@rupea/shared/handle.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { api } from './api';
import { listFiles } from './files.remote';
import { listProblems } from './ledger.remote';
import { replyFromBatchCall, replyFromCall } from './reply';
import { viewGroup, viewSuggestion } from './views';

export const listSuggestions = query(v.object({ handle: Handle, file: Key }), ({ handle, file }) =>
	replyFromCall(
		api()
			.listSuggestions({ handle, file })
			.then((s) => s.map(viewSuggestion)),
	),
);

export const linkGroups = command(
	v.object({
		handle: Handle,
		edits: v.pipe(v.array(LinkEdit), v.minLength(1), v.maxLength(MOST_EDITS)),
	}),
	async ({ handle, edits }) => {
		const linked = await replyFromBatchCall(api().linkGroups({ handle, edits }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		for (const file of new Set(edits.map((e) => e.file)))
			void listSuggestions({ handle, file }).refresh();
		return linked;
	},
);

/** Takes the file only to know which list of suggestions to refresh. */
export const dismissSuggestion = command(
	v.object({ handle: Handle, file: Key, fingerprint: Fingerprint }),
	async ({ handle, file, fingerprint }) => {
		const dismissed = await replyFromCall(api().dismissSuggestion({ handle, fingerprint }));
		void listSuggestions({ handle, file }).refresh();
		return dismissed;
	},
);

export const listGroups = query(v.object({ handle: Handle, file: Key }), ({ handle, file }) =>
	replyFromCall(
		api()
			.listGroups({ handle, file })
			.then((g) => g.map(viewGroup)),
	),
);

/** Takes the file only to know which list of groups to refresh. */
export const renameGroup = command(
	v.object({ handle: Handle, file: Key, group: GroupId, to: GroupId }),
	async ({ handle, file, group, to }) => {
		const renamed = await replyFromBatchCall(api().renameGroup({ handle, group, to }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		void listGroups({ handle, file }).refresh();
		return renamed;
	},
);

/** Takes the file of the page only to know which list of groups to refresh. */
export const makePrimary = command(
	v.object({
		handle: Handle,
		file: Key,
		group: GroupId,
		member: v.object({ file: Key, line: Line }),
	}),
	async ({ handle, file, group, member }) => {
		const made = await replyFromBatchCall(api().makePrimary({ handle, group, ...member }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		void listGroups({ handle, file }).refresh();
		return made;
	},
);
