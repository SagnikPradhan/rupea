# Multiple sources for one money movement form an event, not a merge

The same money movement often reaches the ledger from several sources: an HDFC → IBKR transfer appears on both statements, and a card charge appears on the card statement and in an Amazon order export. We keep every source's transaction intact in its own ledger file and link them into an **event** by a shared ID written in the text (`- event: <id>` on the primary, `- same-as: <id>` on the evidence). Only the primary's postings count, so the money is counted once and no source's record is lost.

## Considered Options

- **Clearing account** (`Assets:Clearing:Amazon` between the two halves): standard bookkeeping, but it invents an account the user never had.
- **Merge into one transaction**: loses the separate source records, and breaks when one order is paid by two charges or one charge covers two orders.
- **Money sources vs detail sources** (only banks create transactions; orders only enrich them): two money sources, such as HDFC and IBKR, can see the same transfer, so no source can be the authority.
- **Links stored only in SQLite**: the index is rebuilt from the files, and editing either transaction would break the link.

## Consequences

- There's no separate duplicate concept. A re-imported statement produces evidence whose description matches the primary's.
- A broken event (no primary, two primaries, one lone `same-as`) is reported during sync and counts all of its members: a visible double count is safer than silently lost money.
- Refinement only _suggests_ events, as a diff the user accepts per event or in bulk by confidence. Rejected suggestions are app behaviour rather than facts about money, so they live in the database, keyed on a fingerprint of the pair. If that row is lost, the worst outcome is the suggestion coming back.
- Candidates must share a date, an amount and a balance account. The description only sets confidence, because different sources describe the same money differently.
