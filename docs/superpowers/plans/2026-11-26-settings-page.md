# Settings page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `/settings` page for the user and each of their ledgers: account terms, budgets, user details and base currency, and the only place they are edited.

**Architecture:** A SvelteKit route under `(signed-in)` renders a You section and one `app-settings-ledger` per ledger, which loads its own terms, holdings and budgets through the existing remote functions and opens the existing forms in asides. User details get three auth procedures. The base currency is file metadata in `main.rupea`, copied to the ledger row on sync, and passed wherever `DEFAULT_COMMODITY` stood.

**Tech Stack:** SvelteKit 2 + Svelte 5 remote functions, oRPC contract, Kysely/Drizzle on Postgres, Valibot, Vitest (`*.dom.test.ts` for components).

**Spec:** `docs/superpowers/specs/2026-11-26-settings-page-design.md`

## Global Constraints

- Follow AGENTS.md: no `let`, no `else`, no braces on one-line bodies, `withContext`, service names `find/list/read/create/save`, at most two parameters, `Record` over `Map`, no comments beyond outside constraints.
- CSS only from `tokens.css` tokens; reuse `ui-panel`, `ui-aside`, `ui-panel-grid`, `ui-field`, `ui-button`, `app-ledger-table`.
- Each part is one commit (more if a task needs it); `pnpm verify` before each commit; no Co-Authored-By lines.
- Coverage goes up: every new rule has a test.

## Review Focus

- A user with two ledgers: every link and aside names the ledger, and saving terms in one never refreshes or writes the other.
- A settings link from Net worth or Spending for an account whose case differs from the ledger's (`liabilities:card`): it still opens that account's form.
- Taking a username or email someone else has: a plain error on the field, not a 500.
- A ledger with no base line: everything reads as INR exactly as before (existing server tests unchanged).
- Switching base on a ledger with explicit `INR` amounts: those stay INR, only bare amounts relabel.

---

## Part 1: the page, with terms and budgets moved

### Task 1: links into settings

**Files:**

- Modify: `packages/web/src/lib/web/shared/links.ts`
- Test: `packages/web/src/lib/web/tests/shared-links.test.ts`

**Interfaces:**

- Produces: `settingsHref(handle: string, q: Record<string, string>): string` → `/settings?ledger=<handle>&<q>#<handle>-<section>` where the section is `accounts` when `q` has `setup` or `add=terms`, and `budgets` when `q` has `budget` or `add=budget`. Query keys: `ledger`, `setup` (an account), `budget` (an account), `add` (`terms` | `budget`).

- [ ] Test `settingsHref('h', { setup: 'Liabilities:Card' })` is `/settings?ledger=h&setup=Liabilities%3ACard#h-accounts`, and `{ add: 'budget' }` ends in `#h-budgets`.
- [ ] Implement, run, pass.

### Task 2: `app-settings-ledger`

**Files:**

- Create: `app-settings-ledger.svelte`, composing `app-settings-accounts.svelte` and `app-settings-budgets.svelte`
- Create: `packages/web/src/lib/web/shared/settings.ts` (pure: `debtGroupsOf(debts)`)
- Test: `packages/web/src/lib/web/tests/shared-settings.test.ts`, `packages/web/src/lib/web/tests/component-app-settings-ledger.dom.test.ts`

**Interfaces:**

- Consumes: `listHoldings`, `listTerms`, `listBudgets`, `listAccounts` from `accounts.remote.ts`; `Liabilities.accountsIn`, `Liabilities.debtsFrom`; `app-terms-form`, `app-budget-form`; `settingsHref`.
- Produces: `debtGroupsOf(debts: Debt[]): { cards: Debt[]; loans: Debt[]; unset: Debt[] }` (leaves only). Component props `{ ledger: { handle: string; name: string } }`; reads `ledger`, `setup`, `budget`, `add` from `page.url` and only acts on them when `ledger` matches its handle.
- Renders sections with ids `<handle>-accounts` and `<handle>-budgets`: three tables (Cards, Loans, Not set up), each row with Edit or Set up; Add a card or loan; a budgets table with Edit and Add budget. Asides as on Net worth and Spending today, keyed by account, closing back to settings without the parameter.

- [ ] Tests for `debtGroupsOf`: a card, a loan and an unset debt fall in their groups; a non-leaf is left out.
- [ ] DOM tests: three tables named Cards, Loans, Not set up; Set up links carry `ledger` and `setup`; `?ledger=h&setup=Liabilities:Card` opens an aside titled "Set up Card" with the terms form; `?ledger=other&setup=…` opens nothing; `?ledger=h&add=budget` opens Add budget offering expense accounts with no budget.
- [ ] Implement, run, pass.

### Task 3: the route, the card link, and the forms off the pages

**Files:**

- Create: `packages/web/src/routes/(signed-in)/settings/+page.svelte`
- Modify: `app-navigation.svelte` (Settings link in the hover card and drawer), `net-worth/+page.svelte`, `spending/+page.svelte`, `app-spending-budgets.svelte`
- Test: `page-settings.dom.test.ts` (new), `component-app-navigation.dom.test.ts`, `page-net-worth.dom.test.ts`, `page-spending.dom.test.ts`

**Interfaces:**

- Consumes: `data.ledgers` from the `(signed-in)` layout; `app-settings-ledger`; `settingsHref`.
- The page: header "Settings" with one muted line, a section list (You, then each ledger's name with Accounts and Budgets), You as an empty section to be filled by Task 5, then one `app-settings-ledger` per ledger.
- Net worth: no `TermsForm`, `Aside`, `setup`/`add` state; every Set up, Edit, "Set a statement day", unknown-debt link and Add a card or loan points to `settingsHref(handle, …)`. Spending: no `BudgetAside`; Add budget and Edit point to settings.

- [ ] Update net-worth and spending tests: links point to `/settings?ledger=h&…`; the old aside tests move to the component test from Task 2.
- [ ] Navigation test: the account card has a Settings link to `/settings`.
- [ ] Page test: one ledger section per ledger, in the section list too.
- [ ] Implement, run `pnpm verify`, commit `feat(web): edit terms and budgets on a settings page`.

## Part 2: you

### Task 4: auth procedures

**Files:**

- Modify: `packages/contract/src/route-auth.ts`, `packages/contract/src/errors.ts`, `packages/shared/src/errors.ts`, `packages/server/src/api/handler-auth.ts`, `packages/server/src/services/auth/application/auth.ts`, `packages/server/src/services/auth/adapters/database.ts`
- Test: `packages/server/src/tests/api-auth.test.ts`, `packages/server/src/services/auth/tests/application-auth.test.ts`

**Interfaces:**

- `auth.requestCode({ email })` → void, reused: for a bearer it mails any address, so the code confirms a new email.
- `auth.saveUser({ username?, email?, code? })` → `User`. Username: trimmed, 3–32 of `[a-z0-9-]`. A new email needs the mailed code (`AuthInvalidCode` otherwise), except with sign-in off. Taken → `NameTaken` or `EmailTaken` (409).
- DB: `saveUser(id, { username?, email? })` → `User`, mapping the unique violations to `NameTaken` and `EmailTaken`.

- [ ] Tests: rename; rename to a taken name; request then save email with the mailed code; wrong code; taken email; sign-in off saves without a code; unauthenticated calls fail.
- [ ] Implement, run, pass.

### Task 5: the You section

**Files:**

- Create: `packages/web/src/lib/web/components/app-settings-you/app-settings-you.svelte`
- Modify: `packages/web/src/lib/endpoints/auth.remote.ts` (`saveUsername`, `requestEmailCode`, `saveEmail` forms), `routes/+layout.server.ts` (pass `email`), the settings page
- Test: `component-app-settings-you.dom.test.ts`

**Interfaces:**

- Props `{ username: string; email: string; local: boolean }`. Username field with Save. Email field: with `local` a Save that saves directly; otherwise Send code, then a code field and Confirm. Errors through `explain`.

- [ ] DOM tests for both modes and the taken-name message.
- [ ] Implement, `pnpm verify`, commit `feat: change your username and email in settings`.

## Part 3: base currency

### Task 6: the base on the ledger

**Files:**

- Create: `docs/adr/00NN-a-bare-amount-is-in-the-ledgers-base.md` (next number)
- Modify: ledger schema (`base` text not null default `'INR'` on `ledgers`) and a migration; sync reads the `base` metadata of `main.rupea`'s preamble, saves it on the ledger, and re-reads every file when it changed; the parser and printer take the base instead of `DEFAULT_COMMODITY`.
- Test: `application-sync.test.ts`, parser tests

**Interfaces:**

- Metadata key: `base`, as `; base: USD` in `main.rupea`'s preamble.
- `ledger.list` answers `{ handle, name, base }`.
- `ledger.saveBase({ handle, base })` writes the preamble line and syncs.

- [ ] Tests: no line → INR; `base: USD` makes `100` USD; switching back relabels; an explicit `INR` stays INR; a bad code is a problem on that line.
- [ ] Implement, run, pass.

### Task 7: valuation in the base

**Files:** `worth.ts`, `cost.ts`, `lots.ts`, `flows.ts`, `deltas.ts`, `feed-mfapi.ts`, the partial index naming `'INR'`, `views.ts`.

- [ ] Tests: a USD-based ledger's net worth is in USD and converts INR holdings by price; mfapi prices stay INR.
- [ ] Implement, run, pass.

### Task 8: currency section and number formats

**Files:** `app-settings-ledger.svelte` (Currency section, id `<handle>-currency`), `format.ts` (locale from the base: `LOCALES: Record<string, string>` with `INR` → `en-IN`, `USD` → `en-US`, `EUR` → `en-IE`, `GBP` → `en-GB`, default `en-US`), the signed-in layout providing the ledger's base.

- [ ] Tests: `formatWhole` writes 1234567 as `12,34,567` under INR and `1,234,567` under USD; the picker offers only currencies a price reaches.
- [ ] Implement, `pnpm verify`, commit `feat: set a ledger's base currency in settings`.
