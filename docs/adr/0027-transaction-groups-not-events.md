# Transaction groups, not events

What [ADR 0001](0001-events-for-multi-source-transactions.md) called an event, the transactions from several sources that record one money movement, is now a group, written `- group: <id>` on the primary. `- same-as: <id>` on evidence is unchanged. A server needs events of its own, things a service announces for others to act on, and backend developers read "event" that way first. The user-facing concept takes the plainer word in the context of transactions, and the internal one keeps the word developers expect.

This is a clean break: `- event:` is no longer read as a link, only as metadata like any other key. Ledgers written before it need `- event:` rewritten as `- group:`.

A group also holds a transfer between two of your own accounts, which each statement sees only one side of. Accepting one writes each side's other account where it said Unknown, so both transactions say the same thing and the group counts it once. This keeps groups the one way to count a movement once. The alternative, a separate kind of link that leaves a transfer out of spending and income, would have had every read tell the two kinds apart. Only a transaction whose other side is still Unknown or Uncategorized is matched, so no category you chose is overwritten.

## Considered Options

- **Keep "event" for the ledger and call the server's something else, like notice**: the files keep their syntax, but every developer reading the server would trip over two meanings of the word.
- **Movement**: the word the definition uses, but it reads as a single transfer rather than records that belong together.
- **Read `- event:` as an old spelling until V1**: no ledger breaks, but the parser carries a second name for a concept that has one user so far.
