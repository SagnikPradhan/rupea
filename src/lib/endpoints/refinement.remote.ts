import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Events from '#services/ledger/application/events.ts';
import { EventRole } from '#services/ledger/application/shared.ts';
import * as Refinement from '#services/refinement/application/refinement.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { listFiles } from './files.remote';
import { Handle, inLedger, Key } from './shared';
import { sync } from './transactions.remote';
import { viewEvent, viewSuggestion } from './views';

const Line = v.pipe(v.number(), v.integer(), v.minValue(1));
const EventId = v.pipe(v.string(), v.regex(/^\S+$/, 'An event id is one word.'));
const Fingerprint = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

export const listSuggestions = query(v.object({ handle: Handle, file: Key }), ({ handle, file }) =>
	replyFrom(
		inLedger({ handle, action: (l) => Refinement.listSuggestions({ ledger: l, file }) }).map((s) =>
			s.map(viewSuggestion),
		),
	),
);

export const linkEvents = command(
	v.object({
		handle: Handle,
		edits: v.array(
			v.object({
				file: Key,
				line: Line,
				date: v.string(),
				description: v.string(),
				role: v.enum(EventRole),
				event: EventId,
			}),
		),
	}),
	async ({ handle, edits }) => {
		const linked = await inLedger({
			handle,
			action: (l) => Events.linkEvents({ ledger: l, edits }),
		});
		void listFiles(handle).refresh();
		void sync(handle).refresh();
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

export const listEvents = query(v.object({ handle: Handle, file: Key }), ({ handle, file }) =>
	replyFrom(
		inLedger({ handle, action: (l) => Events.listEvents({ ledger: l, file }) }).map((e) =>
			e.map(viewEvent),
		),
	),
);

export const renameEvent = command(
	v.object({ handle: Handle, file: Key, event: EventId, to: EventId }),
	async ({ handle, file, event, to }) => {
		const renamed = await inLedger({
			handle,
			action: (l) => Events.renameEvent({ ledger: l, event, to }),
		});
		void listFiles(handle).refresh();
		void sync(handle).refresh();
		void listEvents({ handle, file }).refresh();
		return replyFrom(renamed);
	},
);

export const makePrimary = command(
	v.object({
		handle: Handle,
		file: Key,
		event: EventId,
		member: v.object({ file: Key, line: Line }),
	}),
	async ({ handle, file, event, member }) => {
		const made = await inLedger({
			handle,
			action: (l) => Events.makePrimary({ ledger: l, event, ...member }),
		});
		void listFiles(handle).refresh();
		void sync(handle).refresh();
		void listEvents({ handle, file }).refresh();
		return replyFrom(made);
	},
);
