import type { RupeeError } from '#lib/server/shared/error.ts';
import { fromResult, type ResultAsync } from '#lib/server/shared/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { EventRole, viewTransaction } from '#services/ledger/application/shared.ts';
import * as Refinement from '#services/refinement/application/refinement.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { getFiles } from './files.remote';
import { Handle, inLedger, Key } from './shared';
import { getTransactions } from './transactions.remote';

const Line = v.pipe(v.number(), v.integer(), v.minValue(1));

const EventId = v.pipe(v.string(), v.regex(/^\S+$/, 'An event id is one word.'));

const LinkEdit = v.object({
	file: Key,
	line: Line,
	date: v.string(),
	description: v.string(),
	role: v.enum(EventRole),
	event: EventId,
});

const InFile = v.object({ handle: Handle, file: Key });

const Fingerprint = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

const view = ({ ours, theirs, ...suggestion }: Refinement.Suggestion) => ({
	...suggestion,
	ours: viewTransaction(ours),
	theirs: viewTransaction(theirs),
});

export const getSuggestions = query(InFile, async ({ handle, file }) =>
	fromResult(
		await inLedger({ handle, action: (l) => Refinement.suggestFor(l, file) }).map((s) =>
			s.map(view),
		),
	),
);

export const acceptSuggestions = command(
	v.object({ handle: Handle, edits: v.array(LinkEdit) }),
	async ({ handle, edits }) => {
		const accepted = await inLedger({ handle, action: (l) => Ledger.linkEvents(l, edits) });
		void getFiles(handle).refresh();
		void getTransactions(handle).refresh();
		for (const file of new Set(edits.map((e) => e.file)))
			void getSuggestions({ handle, file }).refresh();
		return fromResult(accepted);
	},
);

export const dismissSuggestion = command(
	v.object({ handle: Handle, file: Key, fingerprint: Fingerprint }),
	async ({ handle, file, fingerprint }) => {
		const dismissed = await inLedger({
			handle,
			action: (l) => Refinement.dismiss(l, fingerprint),
		});
		void getSuggestions({ handle, file }).refresh();
		return fromResult(dismissed);
	},
);

const viewEvent = ({ event, members }: Ledger.FileEvent) => ({
	event,
	members: members.map(({ role, counted, ...t }) => ({ role, counted, ...viewTransaction(t) })),
});

export const getEvents = query(InFile, async ({ handle, file }) =>
	fromResult(
		await inLedger({ handle, action: (l) => Ledger.eventsIn(l, file) }).map((e) =>
			e.map(viewEvent),
		),
	),
);

type ChangeEventOptions = {
	handle: string;
	// The one being viewed, whose events are refreshed.
	file: string;
	action: (ledger: Ledger.Ledger) => ResultAsync<RupeeError[]>;
};

const changeEvent = async (options: ChangeEventOptions) => {
	const { handle, file, action } = options;
	const changed = await inLedger({ handle, action });
	void getFiles(handle).refresh();
	void getTransactions(handle).refresh();
	void getEvents({ handle, file }).refresh();
	return fromResult(changed);
};

export const renameEvent = command(
	v.object({ handle: Handle, file: Key, event: EventId, to: EventId }),
	({ handle, file, event, to }) =>
		changeEvent({ handle, file, action: (l) => Ledger.renameEvent(l, event, to) }),
);

export const makePrimary = command(
	v.object({
		handle: Handle,
		file: Key,
		event: EventId,
		member: v.object({ file: Key, line: Line }),
	}),
	({ handle, file, event, member }) =>
		changeEvent({
			handle,
			file,
			action: (l) => Ledger.makePrimary({ ledger: l, event, ...member }),
		}),
);
