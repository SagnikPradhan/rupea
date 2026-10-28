import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as Groups from '#services/ledger/application/groups.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { GroupRole } from '#services/ledger/application/shared.ts';
import * as DB from '../adapters/database';
import { groupId } from '../domain/ids';
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
		.andThen(() => Groups.listCandidates({ ledger, file }))
		.andThen((c) => DB.listDismissals(ledger.id).map((d) => suggest({ ...c, dismissed: d })))
		.andThen((s) => named(ledger, s));

// One at a time, so two new groups in a batch never get the same name.
const named = (ledger: Ledger.Ledger, suggestions: Suggestion[]): ResultAsync<Suggestion[]> =>
	suggestions.reduce<ResultAsync<Suggestion[]>>(
		(r, s) =>
			r.andThen((d) =>
				(s.group === null ? fresh(ledger, s, d, TRIES) : okAsync(s)).map((n) => [...d, n]),
			),
		okAsync([]),
	);

const fresh = (
	ledger: Ledger.Ledger,
	suggestion: Suggestion,
	done: Suggestion[],
	tries: number,
): ResultAsync<Suggestion> => {
	const primary = suggestion.links.find((l) => l.role === GroupRole.Primary) ?? suggestion.links[0];
	const id = groupId({
		date: primary?.date ?? '',
		description: primary?.description ?? '',
	});

	const retry = () =>
		tries > 1
			? fresh(ledger, suggestion, done, tries - 1)
			: errAsync(fault('GroupIdTaken', { group: id }));
	if (done.some((d) => d.group === id)) return retry();

	return Groups.isGroupIdTaken({ ledger, id }).andThen((t) =>
		t ? retry() : okAsync({ ...suggestion, group: id }),
	);
};

type DismissSuggestionOptions = { ledger: Ledger.Ledger; fingerprint: string };

export const dismissSuggestion = ({
	ledger,
	fingerprint,
}: DismissSuggestionOptions): ResultAsync<void> => DB.saveDismissal(ledger.id, fingerprint);
