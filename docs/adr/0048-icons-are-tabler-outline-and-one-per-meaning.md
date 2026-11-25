# Icons are Tabler outline, one for each meaning

An icon beside a word helps people who scan, who read slowly or who read a second language, and it costs nothing for those who don't need it. Rupea uses [Tabler](https://tabler.io/icons) outline icons only, since they share one stroke and size and the set is MIT licensed. The filled variants are not used.

**One icon for each meaning.** `packages/web/src/lib/web/shared/icons.ts` exports `ICONS`, which maps a meaning (`add`, `delete`, `check`, `close`, `filter`) to its icon. A component takes `ICONS.delete` and never imports from `@tabler/icons-svelte-runes` itself, so the same idea looks the same on every page and changing an icon is one edit. A new meaning gets a new entry named for the meaning, not for the picture.

**An icon beside a word is decoration.** `Button` takes an optional `icon` and draws it before its label, hidden from screen readers, since the label already names the control. An icon alone is only for a control that cannot fit a word, such as close or the theme toggle, and that control carries an `aria-label`. Nothing is told by an icon alone: colour and shape back up the text, they do not replace it.

**Few icons.** An icon goes on the actions a page is for, such as add, save, delete and filter, and not on every button. A row of buttons that all have icons says nothing.

## Considered Options

- **Import icons where they are used**: the same meaning drifts, `trash` in one place and `x` in another for delete.
- **An icon component with a `name` prop**: bespoke, and the name is a string the type checker and the bundler cannot follow.
- **Filled and outline icons**: the filled set is for state, such as a selected tab, and the app shows state with ink instead.

## Consequences

- Adding an icon means adding a meaning to `ICONS`, and reviewers can see a duplicate meaning in one file.
- The Penpot file draws no icons beside labels yet, and `docs/DESIGN.md` is silent. Penpot is to catch up.
