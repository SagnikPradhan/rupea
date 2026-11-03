# The design is the Penpot file

Rupea's look is drawn in Penpot, and the code follows the file. Its token sets are the CSS variables in `packages/theme`, name for name, and its components are the app's components. [docs/DESIGN.md](../DESIGN.md) says the rules in words.

**Paper-like.** A plain surface, ink, and nothing that is not in the file. Numbers come first and are always mono. Colour is ink and grey, with green for money in and red for money out.

**One scale, one corner.** Every size is a multiple of one base, and every gap is a multiple of another, so a screen has no in-between values. Panels, fields, chips and buttons share one soft corner. A panel is the only box.

**Roles, not values.** A screen names a colour role, never a hex. A theme is a swap of the role table, so light and dark are the same screens.

**The file wins.** When a screen and the file disagree, the screen is fixed. When the file says nothing, ask the designer rather than invent a pattern. A block whose data does not exist yet is shown as Coming soon, never as made-up numbers.

## Considered Options

- **Brutalist and dense** (the earlier design): sharp for a working paper, but squares and bare rows made the app feel unfinished, and it gave no room for panels.
- **A conventional app look** (cards, soft shadows): familiar, but shadows and many corner sizes spend space on chrome.
- **Code as the source, Penpot as a picture**: the two drifted, and every screen needed its rules rewritten.

## Consequences

- Penpot's tokens replace the earlier `--size-*` and `--font-size-*` values. Old steps were mapped to the nearest new one by pixel size, and `--size-6`, `--size-7` and `--font-size-display` no longer exist.
- Controls take the border colour and the one radius, and column labels lose their capitals.
- Panels hold a page's blocks, so a page is a header and panels rather than bare rows.
- A change to the look starts in Penpot, then the tokens, then the screens.
