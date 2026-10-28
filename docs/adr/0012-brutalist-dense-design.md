# A brutalist, dense design language

Rupea reads like a sharp accountant's working paper: numbers first, structure on show, nothing decorative. Every screen follows the same few rules, so a new page needs no design of its own. Print-minded sites such as [railroadladies.com](https://railroadladies.com) and [lelism.com](https://www.lelism.com) set the tone.

**Plain HTML is the structure.** Pages are documents: headings, paragraphs, tables, underlined links. Alignment and whitespace separate things, never cards, boxes, panels or shadows. Controls like buttons and inputs may keep a small radius; nothing else is rounded or filled.

**Minimal lines.** A rule is a mark of importance, so there are only two: the ink rule under a table's column headers, and the rule atop the code editor, which takes the accent when it has focus. Everything else, from the sidebar to groups within a table, is set apart by whitespace alone.

**One page anatomy.** Every page is a breadcrumb, a title, its actions, then its content, in that order and in the same place, so moving between pages shows only what changed. The breadcrumb is a small capital trail from the ledger down, separated by icons from the same set as the rest of the app; the title is the page itself; actions are buttons under the title, and a page without any leaves the row out. Spacing is one rhythm, never set piece by piece: the header keeps one gap between its parts, the page a wider one between its blocks, and the breadcrumb lines up with the top of the sidebar.

**Lists are tables.** Anything listed, from transactions and accounts to lots and files, is the same table: a large lead row for the thing itself, muted rows under it for its parts, and whitespace between groups. Files list by their full path, with a storage listing's columns: last change and size. Shared cells, such as an amount or a link to its source line, are one component each.

**Graphs are drawn like tables.** A graph sits on the page with no frame or grid: thin lines, muted axis labels in the data type, no tick marks, and the plot flush with the text column, its value axis on the right. The line a page exists to show is ink; context lines are faint, and dashed when two would otherwise look alike, so colour keeps its meaning. A graph belongs to a figure: a small capital label, with the graph's range links across from it, then the figure in display type and one muted line of context. Hovering moves the figure to that day, and a key under the graph gives the context lines' amounts. The axis fits the data, and zero is drawn only when a line crosses it.

**Two tiers of type.** Display type is huge and rare: the page title, and the one figure a page exists to show. Everything else is data type, at one compact size with a tight line height. Headings under the title step down towards data size rather than through a scale. Each face has a role: a geometric sans for text (Poppins), a display face for titles (Google Sans), and a monospace for numbers and code (Geist Mono).

**Hierarchy is exaggerated.** Extreme scale, stark colour and generous whitespace are there to steer the eye, not to decorate. Every screen, and every group on it, has one thing to read first, such as a transaction's description or an account and its total, then its figures, then its context (dates, sources, accounts) in small muted type. Groups are set apart by whitespace. Column labels are small, muted capitals over an ink rule.

**Space is spent, not wasted.** Wide letterforms are fine; idle padding is not. Whitespace is there to group or separate, and a screen shows as much as it can while staying scannable. Amounts are right-aligned, monospace and tabular, in columns that fit them.

**Monochrome plus meaning.** Ink and grey carry everything. Red marks a negative amount and green a gain. One accent marks where you are and what has focus. Colour never decorates.

**Grey down to the floor, never below it.** Secondary text, such as column headers, posting accounts and sources, is as faint as WCAG AA allows (4.5:1) and no fainter. Fainter tones are only for marks that are not text: rules, gutters, disabled controls. Brutalist, not inaccessible.

**Shrewd.** A screen surfaces what is at stake, such as problems, unpriced holdings and gains, and stays quiet otherwise. Labels are terse. There is no filler copy, illustration or onboarding chatter, and icons appear only where text will not fit.

## The site

rupea.app, the docs and brand site, is read once rather than worked in, so it trades density for room. It keeps the app's faces, ink, grey and accent, and still has no shadows, gradients or illustrations. A page may centre its hero, leave wide margins, and frame a screenshot in a hairline border. Buttons, code blocks and screenshots share the controls' small radius; nothing else is rounded. The manual reads like any docs site, with its pages on the left and the current page's headings on the right.

The app and the site share one theme, `@rupea/theme` in `packages/theme`: the fonts, the reset, the tokens, the element styles and the pieces both draw, such as column labels, tags, buttons and swatches. What only the site needs, its hero size, text column and page layout, is in `site/src/site.css`, so anything there is the site's own. Beyond the app's rules, a hairline under the header and over the footer frames each site page.

**The mark is a rupee sign drawn in rules.** Two bars, then the bowl and leg as one stroke, wholly in the accent beside an ink wordmark set in Google Sans. Its files, with outlined lettering, are in `packages/site/public/brand/`, and the app's favicon is a copy of it.

## Considered Options

- **A conventional app look** (cards, soft shadows, rounded panels): familiar, but it spends space on chrome and hides the data's own structure.
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
