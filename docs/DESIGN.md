# Design

Read this before any change to the app or to rupea.app. The Penpot file is the design. This document says its rules in words, and the tokens in `packages/theme/global.css` are its token sets, name for name. The reasons are in [ADR 0012](adr/0012-design-from-penpot.md).

> Rupea is paper-like: a plain surface, ink, and nothing that is not in the file. Numbers come first, in a monospace face. Panels and controls share one soft corner, and colour appears only where money moves.

When Penpot and this document disagree, Penpot wins and this document is fixed. When Penpot says nothing about a case, ask rather than invent a pattern.

## Tokens

Use the role, never the value. A theme is a swap of the colour table, so a screen that names a hex breaks in the other theme.

**Colour.** Seven roles in a light and a dark theme. `--color-accent` is not one of them: it marks the logo and focus, and nothing on a page.

| Role               | Light     | Dark      | Use                         |
| ------------------ | --------- | --------- | --------------------------- |
| `--color-surface`  | `#fff`    | `#121212` | Page and panel background   |
| `--color-ink`      | `#000`    | `#e6e6e6` | Text and figures            |
| `--color-positive` | `#0a7a3d` | `#4cc47f` | Money in and gains          |
| `--color-negative` | `#c62828` | `#ff7b72` | Money out and errors        |
| `--color-muted`    | `#707070` | `#858585` | Labels and secondary text   |
| `--color-border`   | lightgray | `#3a3a3a` | Inputs and outlines         |
| `--color-subtle`   | `#f5f5f5` | `#1e1e1e` | Shaded rows, panel outlines |

**Type.** Eight styles on three families: Poppins for text (`--font-body`), Geist Mono for money, dates and code (`--font-mono`), Google Sans for display and the brand (`--font-heading`). Every size is a multiple of `--font-size-1`, 18px, so changing it scales the whole page together: from 90rem wide it is 16px, a little smaller than drawn, for a 1080p screen.

| Style             | Face        | Size            | Weight | Line height |
| ----------------- | ----------- | --------------- | ------ | ----------- |
| `.text-display`   | Google Sans | `--font-size-4` | 400    | 1.125       |
| `.text-heading-1` | Google Sans | `--font-size-3` | 400    | 1.125       |
| `.text-title`     | Poppins     | `--font-size-2` | 500    | 1.4         |
| `.text-figure`    | Geist Mono  | `--font-size-2` | 400    | 1.125       |
| `.text-base`      | Poppins     | `--font-size-1` | 400    | 1.4         |
| `.text-data`      | Geist Mono  | `--font-size-1` |        | 1.4         |
| `.text-label`     | Poppins     | `--font-size-0` | 400    | 1.4         |
| `.text-brand`     | Google Sans | `--font-size-1` |        | 1.2         |

`h1` is `text-heading-1`, `h2` is `text-title` and the body is `text-base`. Display is used once, for the one figure a page exists to show. Money is always mono.

**Space.** One scale for every gap, padding and margin, each a multiple of `--size-2`, 18px: `--size-0` is a quarter, `--size-1` a half, `--size-2` one, `--size-3` one and a half, `--size-4` three, `--size-5` six. There are no in-between values. When none fits, use the nearest step.

**Shape.** One corner, `--radius`, half of `--size-2`, on every panel, field, chip and button. The small box inside a chip takes `--radius-small`, half of `--radius`. Nothing casts a shadow.

## Pages

Every page is built from the same components, in the same order: the navigation bar, a page header, then panels.

- **Navigation.** The brand at the left; Home, Accounts, Income, Expenses, Liabilities, Transactions and Files in the centre; the theme toggle, the username and log out at the right. The current page is in ink and the rest are muted. At narrow widths the bar becomes a menu button that opens a drawer: an outlined card at the top right with the brand, the theme toggle and a close button over plain lists of the pages and the account.
- **Page header.** The title in `text-heading-1`, one muted line saying what the page answers, then at the right the filters and the one primary action.
- **Panel.** A `--color-subtle` outline, `--radius`, and `--size-3` of padding and gap. It starts with a panel heading: a `text-title` and one muted line saying what it shows. A panel is the only box; nothing else is boxed.
- **Figures.** A muted `text-label` over a `text-figure` over a muted `text-data` line of context. A strip of four figures sits across the top of a page. Green and red appear in the context line only when a figure means a gain or a loss.
- **Statements and tables.** A name at the left and amounts right-aligned in mono, with `--size-1` above and below each row. A total sits under a line in `--color-border`. Column names are muted `text-label`.
- **Graphs.** No frame and no grid. Context goes in a legend of mono names and amounts, and the value under the cursor in a tooltip. A hover is a small panel.

Boards exist at 1920, 1280 and 768 wide, in light and dark, and the page follows them.

## Controls

- **Button.** A secondary button is outlined in `--color-border` on the surface. The one main action on a page is primary: filled in ink with surface text. An icon button is a secondary button holding one icon instead of a label, for close and the theme toggle.
- **Chip.** A filter that is on or off, with a box before its label. On is outlined in ink with a checked box; off is outlined in `--color-border` with an empty box.
- **Segmented control.** Pick one of a few views. The chosen segment sits on a bordered surface; the others are muted text.
- **Toggle and checkbox.** A setting, or a selected row. On is ink.
- **Field.** A muted label over an outlined input.
- **Search popover.** Results under a search field, with the matching part of an account path in ink.
- **Filter card.** A page's filters: groups of chips and segments, and one toggle for extra options.
- **Filter modal.** What the Filter button in a page header opens: an outlined card at the top right with a title and a close button, the filter card, then Reset and Apply. The page behind it is not dimmed.
- **Coming soon.** A dashed outline with a title and one muted line, "Needs data Rupea does not read yet". It stands in for a block whose data does not exist, so a page never shows invented numbers.

## Code

- Prefer the existing classes and components, and add to Penpot before adding to code.
- A style used by both the app and rupea.app lives in `@rupea/theme`. What only the site needs is in `packages/site/src/site.css`.
- A component's `<style>` takes colours and sizes from the tokens: `rupea/css-tokens` flags a hex or `rgb()` colour and a `px`, `rem` or `em` length, other than 0, 1px, 2px and media widths.
- Every text colour passes WCAG AA in both themes.
- Links stay underlined, and a control stays a control: the look never costs usability.
