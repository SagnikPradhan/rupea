import * as v from 'valibot';
import { command, query } from '$app/server';
import * as Auth from '#services/auth/application/auth.ts';
import * as Refinement from '#services/refinement/application/refinement.ts';
import { EventRole } from '#services/ledger/domain/events.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import { fromResult, type ResultAsync } from '#lib/server/shared/result.ts';
import { Key, viewTransaction } from './shared';
import { getFiles } from './files.remote';
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

const Fingerprint = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

const view = ({ ours, theirs, ...suggestion }: Refinement.Suggestion) => ({
	...suggestion,
	ours: viewTransaction(ours),
	theirs: viewTransaction(theirs),
});

export const getSuggestions = query(Key, async (k) =>
	fromResult(
		await Auth.withCurrentUser(({ id }) => Refinement.suggestFor(id, k)).map((s) => s.map(view)),
	),
);

export const acceptSuggestions = command(v.array(LinkEdit), async (edits) => {
	const accepted = await Auth.withCurrentUser(({ id }) => Refinement.accept(id, edits));
	void getFiles().refresh();
	void getTransactions().refresh();
	for (const file of new Set(edits.map((e) => e.file))) void getSuggestions(file).refresh();
	return fromResult(accepted);
});

export const dismissSuggestion = command(
	v.object({ file: Key, fingerprint: Fingerprint }),
	async ({ file, fingerprint }) => {
		const dismissed = await Auth.withCurrentUser(({ id }) => Refinement.dismiss(id, fingerprint));
		void getSuggestions(file).refresh();
		return fromResult(dismissed);
	},
);

const viewEvent = ({ event, members }: Refinement.FileEvent) => ({
	event,
	members: members.map(({ role, counted, ...t }) => ({ role, counted, ...viewTransaction(t) })),
});

export const getEvents = query(Key, async (k) =>
	fromResult(
		await Auth.withCurrentUser(({ id }) => Refinement.eventsIn(id, k)).map((e) => e.map(viewEvent)),
	),
);

// `file` is the one being viewed, whose events are refreshed.
const changeEvent = async (file: string, run: (userId: string) => ResultAsync<RupeeError[]>) => {
	const changed = await Auth.withCurrentUser(({ id }) => run(id));
	void getFiles().refresh();
	void getTransactions().refresh();
	void getEvents(file).refresh();
	return fromResult(changed);
};

export const renameEvent = command(
	v.object({ file: Key, event: EventId, to: EventId }),
	({ file, event, to }) => changeEvent(file, (u) => Refinement.renameEvent(u, event, to)),
);

export const makePrimary = command(
	v.object({ file: Key, event: EventId, member: v.object({ file: Key, line: Line }) }),
	({ file, event, member }) =>
		changeEvent(file, (u) => Refinement.makePrimary({ userId: u, event, ...member })),
);
