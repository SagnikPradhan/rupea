# Design

Read this before any change to the app or to rupea.app. The app and the site are one system: one grid, one type scale, one style. The reasons behind it are in [ADR 0012](adr/0012-composed-dense-design.md).

> Rupea is composed and sure of itself. Each screen has one obvious thing to read first, a grid you can sense but not see, and no decoration standing in for hierarchy. It reads like clean paper: type and spacing do the work, with no boxes around anything. It should feel calm, high in contrast and generous, and never cold. Controls stand out on purpose, and their soft corners make the app feel welcoming. It sells by showing what's true, plainly and at a confident size.

**Unconventional in how it looks, conventional in how it works.** We don't follow visual norms, but a button is still a button, a link is still underlined, and every text colour passes WCAG AA. If a look makes the app harder to use, the look loses. When this document says nothing about a case, ask rather than invent a pattern.

## Common language

Use these words in code, docs and reviews, and no others for the same things.

| Area     | Term           | Meaning                                                                  |
| -------- | -------------- | ------------------------------------------------------------------------ |
| Colour   | Ink            | The main text colour, `--color-ink`                                      |
| Colour   | Muted          | Secondary text, as faint as AA allows, `--color-muted`                   |
| Colour   | Faint          | Marks that are not text, such as rules, `--color-border`                 |
| Colour   | Accent         | Where you are and what has focus, `--color-accent`                       |
| Type     | Display        | The one thing a screen exists to show, once per screen                   |
| Type     | Statement      | A page title, or a plain sentence that carries a section                 |
| Type     | Heading        | A heading inside a page                                                  |
| Type     | Data           | Everything else: text, rows, controls                                    |
| Type     | Small          | Context: labels, dates, sources                                          |
| Page     | Breadcrumb     | The small capital trail from the ledger down                             |
| Page     | Actions        | The buttons under a title                                                |
| Page     | Block          | One top-level piece of a page's content                                  |
| Page     | Rail           | The 3-column filter area beside a page's content                         |
| Lists    | Lead row       | The large row for the thing itself                                       |
| Lists    | Part row       | The muted rows under a lead row, for its parts                           |
| Lists    | Group          | A lead row and its part rows                                             |
| Lists    | Column label   | A small muted capital over an ink rule                                   |
| Graphs   | Figure         | The number a graph belongs to, with its label and one line of context    |
| Graphs   | Context line   | A faint line that gives the main line something to compare with          |
| Graphs   | Key            | The names and amounts under a graph                                      |
| Controls | Primary button | The one filled button in a form or action row                            |
| Controls | Button         | A bordered button                                                        |
| Controls | Text button    | A button that looks like an underlined link, for secondary actions       |
| Controls | Field          | A label, its control and its errors, the `Field` component               |
| Controls | Filter row     | A muted name beside choices as plain links, the chosen one in the accent |

## Hierarchy

Every screen, and every group on it, has one thing to read first. Then its figures, then its context in small muted type. If two things compete, one of them is wrong.

Display appears once per screen: the hero on the site, the figure on an app page that has one. Page titles use statement size everywhere, so a title always looks the same.

**Check yours:** Blur your eyes. Is one thing obviously first? Does each group have its own first thing?

```css
/* Don't: a second display size competes with the figure */
h1 {
	font-size: var(--text-display);
}
.figure {
	font-size: var(--text-display);
}

/* Do: the title steps back, so the figure leads */
h1 {
	font-size: var(--text-statement);
}
.figure {
	font-size: var(--text-display);
}
```

## Grid

One proportional grid holds everything, on the app and the site:

- 12 equal columns that scale with the window, with gutters and outer margins of `--gap-group`.
- Blocks span 3, 4, 6, 8, 9 or 12 columns. In the app the rail spans 3 and the content 9. A form spans 6.
- The grid stops growing at `--grid-max` and centres beyond that.
- A phone has 4 columns, and blocks stack.
- A table's outer edges sit on grid lines. Its inner columns fit their data.

Every block starts on a column line, and a line once started keeps going down the page, even when it's invisible. Empty space must be a whole number of columns; if you can't say which columns it occupies, it's a mistake. Nothing is squashed below its span or stretched past it.

**Check yours:** Cover the text. Can you still see the columns? Does the left edge hold something, and the right? Is the empty space there because you chose it?

```css
/* Don't: a width that belongs to no column, leaving a lopsided page */
.summary {
	max-width: 37rem;
	margin-left: 4rem;
}

/* Do: a span of the grid */
.summary {
	grid-column: span 6;
}
```

## Space

Tight inside, wide between. Related things sit close, groups and blocks sit far apart, and there's little in between. Use the role, never a number:

| Token           | Size    | Between                                     |
| --------------- | ------- | ------------------------------------------- |
| `--gap-tight`   | 0.25rem | Parts of one line, such as an icon and word |
| `--gap-label`   | 0.5rem  | A label and its control                     |
| `--gap-related` | 1rem    | Items in one group                          |
| `--gap-group`   | 1.5rem  | Groups, and the grid's gutters              |
| `--gap-block`   | 3rem    | Blocks on a page                            |

**Check yours:** Is the gap between groups several times the gap inside them? Can you name the role of each gap?

```css
/* Don't: an in-between value, chosen by eye */
.entry {
	margin-bottom: 1.125rem;
}

/* Do: a role */
.entry {
	margin-bottom: var(--gap-group);
}
```

If no role fits, raise it as a question. Don't add a value.

## Type

| Token              | Size                       | Use                          |
| ------------------ | -------------------------- | ---------------------------- |
| `--text-small`     | 0.8rem                     | Labels, dates, sources       |
| `--text-data`      | 1rem                       | Text, rows, controls         |
| `--text-heading`   | 1.25rem                    | Headings inside a page       |
| `--text-statement` | 2.5rem, 1.75rem on a phone | Page titles, big sentences   |
| `--text-display`   | 4.5rem, 3rem on a phone    | The one thing a screen shows |

Each face has a role: Poppins for text, Google Sans for titles and statements, Geist Mono for numbers and code. Amounts are right-aligned, monospace and tabular.

## Colour

Ink and grey carry everything. Red marks a negative amount or a problem, and green a gain. The accent marks where you are and what has focus. Colour never decorates. Muted text stays at 4.5:1 or above in both themes, and fainter tones are only for marks that are not text. Graph fills are shades of the accent, told apart by density.

## Lines and corners

Lines divide, they never enclose. A hairline may mark a major section, and an ink rule sits under column labels. A line that forms a box around content is a card, and we don't make cards or paper surfaces. "Paper-like" is a feel that comes from type and space.

Corners are soft only on what you can interact with, and on product screenshots. Everything else is square.

```svelte
<!-- Don't: a card -->
<section class="card">Net worth</section>

<!-- Do: space and a label set it apart -->
<section><h2 class="label">Net worth</h2></section>

<style>
	.card {
		padding: var(--gap-group);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
	}
</style>
```

## Pages and lists

Every app page is a breadcrumb, a title, its actions, then its content, in that order and in the same place. `PageHeader` draws the first three. A page with no actions leaves the row out.

Anything listed is the same table: a lead row, part rows, and whitespace between groups. Use `LedgerTable` or `PagedTable`, not a new table. Shared cells, such as an amount or a source link, are one component each.

A list's filters are filter rows, in the rail where there's room. Every choice is in view, and filtering is following links. Only search is typed, into a full-width field named by its placeholder.

Graphs have no frame or grid, thin lines, muted axis labels in the data face, and no tick marks. The line a page exists to show is ink. A graph belongs to a figure.

## Components

Reuse these before writing CSS. A component adds layout only: grid, flex and gaps, never its own control sizes.

| Need                  | Use                               | See it on       |
| --------------------- | --------------------------------- | --------------- |
| A title and its trail | `PageHeader`                      | Every page      |
| A labelled input      | `Field`                           | Sign-in, import |
| An action             | `Button`, with `primary` if first | Files           |
| A row of choices      | `.picker`, or `PeriodPicker`      | Accounts        |
| A list                | `LedgerTable`, `PagedTable`       | Transactions    |
| A column label        | `.label`, `.labelled`             | Accounts        |
| An amount             | `Amount`                          | Transactions    |

## Forms

Mainstream words come first (category, currency), with ledger terms only behind an advanced path such as "Split".

- A form spans 6 columns, and only a large free-text editor goes wider. Controls fill their grid cell, so their edges line up down the form.
- Label above the control, in one column. Short pairs like amount and currency can share a row.
- `--gap-label` from label to control, `--gap-related` between fields, `--gap-group` between groups.
- Errors go through `Field`, under the control, in negative. One alert sits near submit for failures not tied to a field.
- One primary button at the bottom left, with cancel as a text button beside it.
- Rare options sit behind one text button, which opens by itself if a hidden field has an error.

```svelte
<!-- Don't: a local error style and a sized control -->
<input style="padding: 0.3rem" /><span class="problem">Write an amount.</span>

<!-- Do -->
<Field label="Amount" issues={issuesAt('amount')}><input /></Field>
```

## States

A state appears in the page's normal text at its normal position.

| State       | Rule                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Empty       | One plain sentence saying what will appear, and the action that starts it. No illustration or placeholders  |
| Loading     | The layout stays, with a muted "Loading…" where the content will be. No spinners or skeletons, and no shift |
| Page error  | A sentence in ink saying what happened and what to do, with the failing part linked. Negative only marks it |
| Destructive | A plain button that asks for confirmation inline, in the same place. No modals, and no red fill             |
| Disabled    | Faint, and only for a temporary state. If the action will never apply, leave it out                         |
| Success     | Show the result itself, such as the new row or a link to the saved line. No toasts                          |

## Words and selling

The site sells, and everything it says is true. No invented numbers, logos or testimonials, and nothing that makes Rupea seem like something it isn't. State the work-in-progress status as it is, and label demo data as demo data. Labels are terse, with no filler or onboarding chatter.

## Imagery and motion

Show the real product at a readable size, not as thumbnails. For art, set real ledger lines and large figures as type, use the ₹ mark at scale, or draw line art in single-weight strokes of ink or accent. Agents may draw line art. Photography and other illustration must be our own or CC0, with the source recorded beside the file.

There's no animation for now.

## References

Run `pnpm design:references` to save these to `references/` locally. The folder is ignored by git, because the images are other people's work. These descriptions are what we keep, and they are specific enough to check work against without the images. Our own screens replace them as they catch up.

### Offsuit: the main reference

[offsuit.app](https://offsuit.app). Minimalism, huge type and clarity, especially for selling an app. Black page, white type, one sans. The name runs edge to edge at the very top. Below it comes a short plain line, then the products. Further down, one sentence in very large type says who they are: "a small team of designers and developers who love card games, but hate scams". The eye never has to choose, because each height of the page holds one idea.

**Check yours:** Could you name the single idea at each scroll position? Is the copy blunt enough to read at a glance?

**Don't take:** its rounded cards, or its 3D icons.

### Andmade: composure

[andmade.jp](https://andmade.jp). Composure inside apparent chaos. Pale, calm, almost nothing on the page. Three columns of projects start at the same three x positions on every row, so you see a grid with no lines drawn. The eye lands first on a bold underlined title, the only strong thing in each entry. Under it, tight against it, sit two or three small grey lines, ending in a monospace date. A large gap follows, about four times the gap inside the entry, so each entry reads as a single object without a box. Empty columns stay empty on purpose.

**Check yours:** Cover the text. Can you still see the columns? Is one thing per group obviously first? Is the gap between groups several times the gap inside them?

**Don't take:** text too faint to read, or its motion for now.

### Goodside: hierarchy from text

[goodside.studio/about](https://www.goodside.studio/about). Hierarchy made from text alone. A tiny uppercase label sits over a hairline that crosses the page, and the content under it is much larger than the label. Sections keep returning to the same few x positions. A lead paragraph of about 39px does the work of a hero. Lists are just words at a generous size, with no bullets or boxes. Every band has something at its left and its right edge.

**Check yours:** With images removed, is the order of reading still clear? Do sections share starting positions?

**Don't take:** its coloured washes, or copy word for word.

### Linkletter: clean paper

[linkletter.press](https://linkletter.press). A clean, paper-like feel. White page, warm dark ink, unhurried type, and generous room around a single centred idea. One small mark of colour goes a long way. It feels printed because nothing glows, floats or competes.

**Check yours:** Would it look at home printed on a sheet of paper?

**Don't take:** paper as an object or a surface in the interface. Our paper is a feel.

### Railroad Ladies: layout and contrast

[railroadladies.com](https://railroadladies.com). A core brutalist example, for its layout and high contrast only. Stark black and white, huge capitals, and two thin vertical lines that set the structure of the whole page.

**Check yours:** Is the contrast decisive, and is the structure stated once and held?

**Don't take:** its poster-like disregard for reading and use. It's the limit of how far we go.
