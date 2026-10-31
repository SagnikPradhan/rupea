# A composed, dense design language

Rupea reads like a sharp accountant's working paper: numbers first, structure on show, nothing decorative. It's unconventional in how it looks and conventional in how it works. The rules, shared language and references are in [docs/DESIGN.md](../DESIGN.md); this records why.

We began by calling this brutalist. Taken literally, that kept producing screens that were hard to use, so the word no longer leads. What we keep from brutalism is not following visual norms, high contrast and structure on show.

**One system.** The app and rupea.app share one grid, one type scale and one style through `@rupea/theme`, so moving between them feels like one product and nothing is maintained twice.

**Lines divide, they never enclose.** Boxes spend space on chrome and hide the data's own structure. A hairline can mark a major section, but cards and panels are out.

**Soft corners on controls.** A slight radius is welcoming, and limiting it to what you can interact with makes controls stand out.

**Fewer sizes.** The type scale was cut from five steps to a few with one large jump, because a cleaner scale gives stronger hierarchy. Display appears once per screen so that one thing is always read first. Scale stays moderate since Rupea will also be used as an app on small screens.

**Space by role.** Spacing is named for what it separates, so a person or an agent picks by meaning and values can't drift.

**A proportional grid.** A shared 12-column grid makes empty space deliberate and stops pages feeling lopsided, squashed or too spread out.

**A wider page.** The content column grew from 48rem because an app with this much data needs the room.

**AA, always.** Muted text moved from a translucent colour to a solid grey tuned just above 4.5:1. Rupea is a hosted service for many users, and we don't want to push any of them away. The accent moved from olive to brown because olive looked wrong in contrast.

**Selling honestly.** The site sells, but says only what's true.

**The mark is a rupee sign drawn in rules.** Two bars, then the bowl and leg as one stroke, wholly in the accent beside an ink wordmark set in Google Sans. Its files, with outlined lettering, are in `packages/site/public/brand/`, and the app's favicon is a copy of it.

## Considered Options

- **A conventional app look** (cards, soft shadows, rounded panels): familiar, but it spends space on chrome and hides the data's own structure.
- **Full brutalism**: distinctive, but it repeatedly made the app unusable.
- **Pure black and white**: sharper, but a loss would read only from its minus sign.
- **Grey below AA for unimportant text**: a crisper hierarchy, but some people could not read it, and Rupea is a hosted service for many users.

## Consequences

- The code editor loses its box, slab gutter and accent colours, and sits on the page like a table.
- Ledger tables share one component, so the density and alignment rules live in one place.
- The muted colour is tuned to sit just above 4.5:1 in both themes.
- Files are a table on their own page rather than a tree beside the editor, and an open file has the full width.
- Net worth leads the accounts page: its figure in display type, then a graph of it, then the accounts that make it up.
- A list's filters are rows above it, each a muted name beside its choices as plain links, the chosen one in the accent, so filtering is following links rather than filling in a form. Every choice is always in view; nothing opens to show them. An account's row reads as a path, from All down through its parents to it, then the accounts under it, each with its parents' first letters faded before its name, as on the accounts page. The choices line up with the table's second column, so the filters and the table share one edge. Only the search is typed, into a full-width field above the rows, named by its placeholder.
- Lots are one table, each lot a lead row with its sales under it, rather than a heading and a table per lot.
- File keys are meant to be case-insensitive. The backend still matches them by case, until it changes.
