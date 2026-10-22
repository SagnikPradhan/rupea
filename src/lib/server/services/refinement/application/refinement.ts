import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as Events from '#services/ledger/application/events.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { EventRole } from '#services/ledger/application/shared.ts';
import * as DB from '../adapters/database';
import { eventId } from '../domain/ids';
import { suggest, type Suggestion } from '../domain/matching';

export type { Suggestion };

// A random word clashes rarely enough that a few tries settle it.
const TRIES = 5;

type ListSuggestionsOptions = { ledger: Ledger.Ledger; file: string };

// Runs after a file is saved, and on request: only that file's transactions
// look for partners, so the work grows with the file, not the ledger.
export const listSuggestions = ({
	ledger,
	file,
}: ListSuggestionsOptions): ResultAsync<Suggestion[]> =>
	Sync.syncIndex(ledger)
		.andThen(() => Events.listCandidates({ ledger, file }))
		.andThen((c) => DB.listDismissals(ledger.id).map((d) => suggest({ ...c, dismissed: d })))
		.andThen((s) => named(ledger, s));

// One at a time, so two new events in a batch never get the same name.
const named = (ledger: Ledger.Ledger, suggestions: Suggestion[]): ResultAsync<Suggestion[]> =>
	suggestions.reduce<ResultAsync<Suggestion[]>>(
		(r, s) =>
			r.andThen((d) =>
				(s.event === null ? fresh(ledger, s, d, TRIES) : okAsync(s)).map((n) => [...d, n]),
			),
		okAsync([]),
	);

const fresh = (
	ledger: Ledger.Ledger,
	suggestion: Suggestion,
	done: Suggestion[],
	tries: number,
): ResultAsync<Suggestion> => {
	const primary = suggestion.links.find((l) => l.role === EventRole.Primary) ?? suggestion.links[0];
	const id = eventId({
		date: primary?.date ?? '',
		description: primary?.description ?? '',
	});

	const retry = () =>
		tries > 1
			? fresh(ledger, suggestion, done, tries - 1)
			: errAsync(fault('EventIdTaken', { event: id }));
	if (done.some((d) => d.event === id)) return retry();

	return Events.isEventIdTaken({ ledger, id }).andThen((t) =>
		t ? retry() : okAsync({ ...suggestion, event: id }),
	);
};

type DismissSuggestionOptions = { ledger: Ledger.Ledger; fingerprint: string };

export const dismissSuggestion = ({
	ledger,
	fingerprint,
}: DismissSuggestionOptions): ResultAsync<void> => DB.saveDismissal(ledger.id, fingerprint);
