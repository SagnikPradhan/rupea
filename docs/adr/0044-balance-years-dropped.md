# Balance years are dropped

[ADR 0030](0030-net-worth-from-year-rows.md) stored each account's balance on every day of every year it moved in, in a table called `balance_years`. [ADR 0040](0040-worth-is-a-running-sum-of-deltas.md) made balances a running sum of monthly deltas, valued at the end of each bucket, and [ADR 0041](0041-bridge-composes-the-two-reads.md), [ADR 0042](0042-returns-compose-the-two-reads.md) and [ADR 0043](0043-drops-compose-the-two-reads.md) moved the last readers onto it. Nothing reads the table any more, yet every settle still rewrote it, from the edited year to the last. The table is dropped by a new migration, and so are its writers and the repair of its years.

Price years stay. Prices still belong to symbols, and the rates of a span are still decoded from them.

## What went

- The table and its migration: `0016_drop_balance_years.sql` drops it.
- The write of balance years after a settle, the repair of the years the check comes round to, and the step that built them for a ledger indexed before they existed. The check still rewrites the twelve months it comes round to.
- The day grain of the deltas read, which only the years write used. Every read takes whole months where it can.
- The code that walked balance years into worth, endings and deltas, and the part of the rates that built a rate for every day of a span for it. It lived in the worth module, and only tests called it.

## The old walk stays as a check

The worth walk, with its exact rate for each day, moves into the test fixtures as the worth oracle. The tests that compare the reads against the exact decode of the stored prices keep it, and no production code imports it. The rates for a few days and the rates for every day stay in the worth module, since the balances read uses them.

## What an edit cost before and after

The bench of the files service, in milliseconds, mean and 99th percentile. Before is the committed benchmarks file. After is the second of two runs on the same machine.

| Case                      | Before   | After    |
| ------------------------- | -------- | -------- |
| Edit oldest, twenty-years | 182, 200 | 112, 147 |
| Edit newest, twenty-years | 113, 129 | 93, 103  |
| Import 100, twenty-years  | 62, 65   | 42, 46   |
| Edit oldest, fifty-years  | 234, 257 | 100, 113 |
| Edit newest, fifty-years  | 106, 115 | 84, 95   |
| Import 100, fifty-years   | 62, 66   | 43, 44   |

Editing the oldest file is now under 150 milliseconds on both ledgers, where it was over. The earlier numbers also include the gains of the reads before this step, so not all the change comes from the table.

## Consequences

- A ledger no longer needs a build step for balances. A sync that finds nothing changed only checks that its symbols have price years.
- The old rule that every step changing balances must rewrite their years is gone. Price years keep their rule.
- The note in ADR 0030 that a year left wrong is put right as the check comes round now holds for the months only.
