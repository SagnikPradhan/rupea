# Settings page

## Intent

Everything a person configures in Rupea lives on one page. Today account terms are edited from Net worth and budgets from Spending, the base currency is fixed to INR, and user details cannot be changed at all. The settings page gathers them, and becomes the only place they are edited.

## Goals

- One global page, `/settings`, for the user and for every ledger they own.
- Account terms and budgets are edited only there. The pages that show them link to their form in settings.
- A user can change their username and email.
- A ledger has a base currency that can be changed at any time, and numbers are written in that currency's style.

## Non-goals

- Settings for assets. Terms exist for cards and loans only; assets join when a kind exists for them.
- A page per ledger, or a ledger picker. With one ledger the page reads as one page; more ledgers add groups.
- Converting amounts when the base changes. Switching the base relabels, it does not convert.
- Date formats. Only number grouping follows the currency.

## Anti-goals

- A settings table in the database for what the ledger's files can say. Terms (`A`), budgets (`B`) and the base currency stay in the files, as ADR 0034 and 0046 decided.
- Rewriting a ledger's files when the base changes.
- A form for terms or budgets anywhere but settings.

## Approaches

For where settings live:

- **Global `/settings`, with ledger groups (picked).** One place for everything, reached from the account card. Grows with ledgers without a picker.
- **`/l/[handle]/settings` as a fourth tab.** Fits `PAGES`, but user details are not a ledger's, and the bar is for reading money, not configuring.
- **Forms stay where they are, settings lists and links.** Least change, but configuration stays scattered, which is the problem.

For what a bare amount means once the base can change:

- **A bare amount is in the base, and switching relabels (picked).** A ledger reads cleanly in its own currency, and a base picked wrongly at the start is fixed by one change. Written currencies keep their meaning.
- **A bare amount is always INR.** Nothing is ever reread, but a ledger abroad writes its currency on every line.
- **Switching rewrites bare amounts with the old currency.** Values never change meaning, but every file is rewritten.

## Design

One PR stacked on #120 (`feat/ledger-tab-and-cards`), one commit per part, in this order.

### 1. The page, with terms and budgets moved

- Route `/(signed-in)/settings`. A section list at the left: **You**, then one group per ledger the user owns, each with **Accounts**, **Budgets** and **Currency**. Sections are anchors on the one page.
- **Accounts**: every liability, in separate tables per kind: **Cards**, **Loans**, **Not set up**. Each row links Edit or Set up, which opens the existing `app-terms-form` in a `ui-aside`, keyed by a query parameter naming the ledger and account.
- **Budgets**: a table of budgets with Edit, and Add budget, opening the existing `app-budget-form` in an aside the same way.
- The account card in the bar (`app-navigation`, both the hover card and the drawer) gains a Settings link beside the ledgers and Sign out.
- Net worth and Spending lose their asides and form imports. Their Set up, Edit and Add budget links point to the form in settings.
- No new endpoints: `listTerms`, `listBudgets`, `saveTerms` and `saveBudget` already take a handle.

### 2. You

- Username and email fields, each saved on its own.
- Username saves directly; a taken name fails with the existing `NameTaken`. The avatar colour follows the username, so it changes too.
- Email: with sign-in by code, the new address is sent a code, and the change holds once the code is entered, through the same email-code store sign-in uses. With sign-in off (`RUPEA_ACCOUNTS_SIGNIN=none`) the email saves directly.
- New procedures in the contract and handlers in `packages/server/src/api`, tested in `packages/server/src/tests`.

### 3. Base currency

- Stored as metadata in the preamble of `main.rupea` (ADR 0046), which the parser already reads as file metadata. No base line means INR.
- A bare amount means the ledger's base. A written currency keeps its meaning. Changing the base relabels every bare amount.
- The base replaces `DEFAULT_COMMODITY` in the parser, the printer, valuation (`worth.ts`, `cost.ts`, `lots.ts`, `flows.ts`, `deltas.ts`) and the web views. Feeds that quote a fixed currency, such as mfapi in INR, name it rather than the base.
- Postings keep storing the resolved commodity, so queries keep comparing to a parameter. Changing the base re-reads the ledger in a background job (ADR 0010); a switch is rare, so its cost is fine. The partial index that names `'INR'` is changed to suit any base.
- The picker offers the currencies the ledger can be valued in: those a price path reaches.
- Number formats: `format.ts` takes its locale from the base, through a `Record` of currency to locale (INR → en-IN, USD → en-US, …). Euro gets one default. Every number on a page follows the base, so a page never mixes groupings.
- An ADR records the meaning of a bare amount and the relabel.

## Left to the builder

- The query parameter names for the asides, and the anchor ids.
- The metadata key for the base in `main.rupea`.
- How the web learns the base: from the ledger read the layout already does, or a field beside it.
- The exact currency-to-locale table, beyond INR and USD.
- Whether the email code reuses `email_codes` as is or needs a column for the pending address.
