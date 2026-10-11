# Metadata is a dash line attached to the nearest line above

Ledger files need metadata at three levels (file, transaction, posting), and the syntax must keep growing. A `- key: value` line belongs to the nearest non-dash line above it: the transaction header or a posting. Dash lines before the first transaction belong to the file. Indentation means nothing to the parser, although the printer indents posting metadata one level deeper so it's easier to read. Transaction metadata comes before the first posting, there's one key per line, repeated keys merge into a list, and no key is reserved.

## Considered Options

- **Indented `key: value` lines**: indentation and letter case decided what a line meant and what it belonged to, which was confusing to read.
- **Trailing `[key: value]` brackets**: clear about what each piece belongs to, but lines get long, and a `[` in a bank narration is ambiguous.
- **hledger-style `; key: value` comments**: metadata and comments become the same syntax, and a `;` in a narration is ambiguous.
- **A `|` marker line**: unambiguous, but the character is hard for casual users to find.
- **Sidecar metadata files**: splits one transaction's facts across two files that can get out of step.
- **Sigils in the header** (`#tag`, `^link`): bank narrations contain `#`, and a description must stay exactly as the bank printed it.

## Consequences

- A posting starts with an account and never with `-`, so dash lines can't be confused with postings. `=`, `@` and `{}` stay free for balance assertions, prices and lots.
- Older parsers fail loudly on files that use dash lines instead of misreading them.
