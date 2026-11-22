# Design

Read this before any change to the app or to rupea.app. The Penpot file is the design. This document says its rules in words, and the tokens in `packages/theme/src/tokens.css` are its token sets, name for name. The reasons are in [ADR 0012](adr/0012-design-from-penpot.md).

> Rupea is paper-like: a plain surface, ink, and nothing that is not in the file. Numbers come first, in a monospace face. Panels and controls share one soft corner, and colour appears only where money moves.

When Penpot and this document disagree, Penpot wins and this document is fixed. When Penpot says nothing about a case, ask rather than invent a pattern.

## Tokens

Use the role, never the value. A theme is a swap of the colour table, so a screen that names a hex breaks in the other theme.

**Colour.** Four base colours and ten chart colours, each in a light and a dark theme. They are the only hex values.

| Base               | Light     | Dark      | Use                       |
| ------------------ | --------- | --------- | ------------------------- |
| `--color-surface`  | `#fff`    | `#121212` | Page and panel background |
| `--color-ink`      | `#000`    | `#e6e6e6` | Text and figures          |
| `--color-positive` | `#0a7a3d` | `#4cc47f` | Money in and gains        |
| `--color-negative` | `#c62828` | `#ff7b72` | Money out and errors      |

Ink and negative each have a scale, `-1` to `-6`, the colour at 6, 12, 24, 36, 50 and 70% over the surface. A scale is for things that rank, such as the parts of a chart and the heat of a calendar.

The ten chart colours, `--color-chart-1` to `--color-chart-10`, are the one place colour carries identity rather than money: they tell the parts of a chart apart, in this order, the largest part first. They are blue, orange, orchid, cyan, gold, violet, copper, aqua, lime and ink, warm and cool alternating so neighbouring parts contrast. The nine hues share one lightness and a mid chroma, saturated enough to read as modern and not as pastel; the tenth is a near-black, the part least worth a hue. None is red, and the one green is a yellow-green, so a part is never read as a loss or a gain. Each passes 3:1 against the surface in both themes, as a chart mark must. Nothing else uses them.

The semantic roles are built from the base colours and carry no hex of their own.

| Role             | Built from | Use                         |
| ---------------- | ---------- | --------------------------- |
| `--color-muted`  | ink at 56% | Labels and secondary text   |
| `--color-border` | `ink-2`    | Inputs and outlines         |
| `--color-subtle` | `ink-1`    | Shaded rows, panel outlines |

Muted sits off the scale at 56% because secondary text needs a contrast of 4.5:1 on the surface in both themes, and 50% falls short.

**Type.** Eight styles on three families: Poppins for text (`--font-body`), Geist Mono for money, dates and code (`--font-mono`), Google Sans for display and the brand (`--font-heading`). Every size is a multiple of `--font-size-1`, so changing it scales the whole page together. It is fluid: 18px at 768px wide down to 16px at 1440px, in between by viewport width.

| Token              | Face        | Size            | Weight | Line height |
| ------------------ | ----------- | --------------- | ------ | ----------- |
| `--text-display`   | Google Sans | `--font-size-4` | 400    | 1.125       |
| `--text-heading-1` | Google Sans | `--font-size-3` | 400    | 1.125       |
| `--text-title`     | Poppins     | `--font-size-2` | 500    | 1.4         |
| `--text-figure`    | Geist Mono  | `--font-size-2` | 400    | 1.125       |
| `--text-base`      | Poppins     | `--font-size-1` | 400    | 1.4         |
| `--text-data`      | Geist Mono  | `--font-size-1` | 400    | 1.4         |
| `--text-label`     | Poppins     | `--font-size-0` | 400    | 1.4         |
| `--text-brand`     | Google Sans | `--font-size-1` | 400    | 1.2         |

Each is a `font` shorthand, used as `font: var(--text-label)`, with colour set beside it, as Penpot pairs a typography token with a fill. `h1` is `text-heading-1`, `h2` is `text-title` and the body is `text-base`. Display is used once, for the one figure a page exists to show. Money is always mono.

**Space.** One scale for every gap, padding and margin, each a multiple of `--size-2`, the base size: `--size-0` is a quarter, `--size-1` a half, `--size-2` one, `--size-3` one and a half, `--size-4` three, `--size-5` six. There are no in-between values. When none fits, use the nearest step.

**Shape.** One corner, `--radius-1`, the same as `--size-1`, on every panel, field, chip and button. The small box inside a chip takes `--radius-0`, half of `--radius-1`. Every outline, border and rule is `--size-line-0`, 1px; `--size-line-1`, twice that, is for emphasis: focus, errors, underlines and the main line in a chart. Nothing casts a shadow.

**Layers.** A `z-index` is always a layer token, never a number. `--layer-raised` lifts a thing above its siblings, such as a sticky table cell or a chart mark, and `--layer-focused` lifts the one being pointed at above those. `--layer-overlay` is for panels fixed over the page, the menu drawer and the aside. `--layer-popover` is for dropdowns and tooltips, which sit above everything, overlays included. Stylelint rejects any other value.

## Pages

Every page is built from the same components, in the same order: the navigation bar, a page header, then panels.

- **Navigation.** The brand at the left; Home, Spending, Net worth and Ledger in the centre; the theme toggle, the username and log out at the right. The current page is in ink and the rest are muted. At narrow widths the bar becomes a menu button that opens a drawer: an outlined card at the top right with the brand, the theme toggle and a close button over plain lists of the pages and the account.
- **Page header.** The title in `text-heading-1`, one muted line saying what the page answers, then at the right the filters and the one primary action.
- **Panel.** A `--color-subtle` outline, `--radius-1`, and `--size-3` of padding and gap. It starts with a panel heading: a `text-title` and one muted line asking the question the panel answers, such as "Which days cost the most?". A panel is the only box; nothing else is boxed. A panel that holds only a table or statement is plain: no outline or padding, the heading and the grid alone, since the grid already frames it.
- **Figures.** A `text-figure` over a muted `text-label` name over a muted `text-label` line of context, both in the body font. Four figures sit in one panel, stacked, beside the top chart of a page. That chart has no box or heading, since its hero figure names it. Green and red appear in the context line only when a figure means a gain or a loss.
- **Statements and tables.** A name at the left and amounts right-aligned in mono, laid out on a grid: a `--color-subtle` rule between columns, `--size-1` above and below each row. A total sits under a line in `--color-border`. Column names are muted `text-label`.
- **Statement sheet.** The cells a statement was read from. A bordered grid in `--color-border` with a soft outer corner, muted mono column letters over centred row numbers that stay in view, and mono cells with `--size-1` above and below.
- **Graphs.** No frame and no grid. Context goes in a legend of mono names and amounts, and the value under the cursor in a tooltip. A hover is a small panel.

Boards exist at 1920, 1280 and 768 wide, in light and dark, and the page follows them.

## Controls

- **Button.** A secondary button is outlined in `--color-border` on the surface. The one main action on a page is primary: filled in ink with surface text. An icon button is a secondary button holding one icon instead of a label, for close and the theme toggle.
- **Chip.** A filter that is on or off, with a box before its label. On is outlined in ink with a checked box; off is outlined in `--color-border` with an empty box. A chip with no link is a button, for choosing one of a few, like the kind of a transaction.
- **Segmented control.** Pick one of a few views. The chosen segment sits on a bordered surface; the others are muted text.
- **Toggle and checkbox.** A setting, or a selected row. On is ink.
- **Field.** A muted label over an outlined input.
- **Select.** Pick one of many: an outlined button holding the choice and a chevron, opening a list under it with a check by the choice. Use `ui-select`, never a native select.
- **Suggest field.** Type or pick: an outlined input whose list under it narrows as you type and still takes any text. Use `ui-combobox`, never the browser's own suggestion list.
- **Search popover.** Results under a search field, with the matching part of an account path in ink.
- **Filter card.** A page's filters: groups of chips and segments, and one toggle for extra options.
- **Dialog.** A task that needs an answer before the page goes on, such as adding a draft to the ledger. A centred card with a title and a close button, over a dark scrim (`--color-scrim`) that blurs the page behind it. Escape, the close button and Cancel leave it; its main button is primary and sits at the bottom right.
- **Filter modal.** What the Filter button in a page header opens: an outlined card at the top right with a title and a close button, the filter card, then Reset and Apply. The page behind it is not dimmed.
- **Aside.** What add and edit open: a panel beside the page from 90rem, a card at the top right below that, and the whole screen under 48rem, with a title and a close button. The close button may be left out beside the page when the page keeps its own way to close in view. Use `ui-aside` inside a wide `ui-panel-grid` for any such side form.
- **Setting.** Settings is one long page, so its add and edit forms open in place under the setting, not in an aside. Groups take `text-heading-1`, each setting a panel heading, and its fields the usual labels.
- **Import panel.** A drop zone over the list of uploaded statements, in a panel on the Files page. The Files list is a page header over two equal panels, Your files and Import statements, side by side from 90rem and stacked under it. They are plain panels that scroll with the page, not an aside, which is a form that add and edit open. The drop zone is a dashed outline in `--color-ink-3` that turns solid ink while a file is dragged over it. Click it to choose files instead. With a file open, the side column holds its Matches panel, which sits beside the page from 90rem and below it under that: the link to review possible matches, and the file's groups. The code editor is as tall as the window leaves it (`--size-height-3`) and scrolls inside, so the navigation stays in view.
- **Import review.** Opens in the Files page, in place of the editor, for an uploaded statement: the file name as the page title, a Back to files button at its right, then the transactions found, in the same rows as the Transactions page, each opening the Edit transaction aside, and what to do with them. Files uploaded together stay in the aside list, to open one at a time.
- **Text and Transactions views.** A segmented control, Text and Transactions, on every file, a draft under review as well as a ledger file, with the same title, tags and toolbar; a draft only adds Add to ledger and a third view, Statement, and opens on Transactions where a ledger file opens on Text. `?view=text`, `?view=ui` or `?view=statement` sets it. Text is the editor; Transactions lists the file's transactions, and choosing one opens the Edit transaction aside, the form of the Transactions page, which takes the column in place of the Import and Matches panels until it closes; Statement is the sheet the draft was read from.
- **Coming soon.** A dashed outline with a title and one muted line, "Needs data Rupea does not read yet". It stands in for a block whose data does not exist, so a page never shows invented numbers.

## Code

- Prefer the existing classes and components, and add to Penpot before adding to code.
- A style used by both the app and rupea.app lives in `@rupea/theme`. What only the site needs is in `packages/site/src/site.css`.
- A component's `<style>` takes colours and sizes from the tokens: Stylelint (`stylelint.config.js`) flags a hex, named or `rgb()` colour and a `px`, `rem` or `em` length anywhere but a media width.
- Every text colour passes WCAG AA in both themes.
- Links stay underlined, and a control stays a control: the look never costs usability.
