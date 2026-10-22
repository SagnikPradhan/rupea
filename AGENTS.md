# AGENTS.md

Rupee is open source and meant to read obviously to a newcomer. Prefer plain TypeScript over bespoke helpers, and names that state how they differ from their siblings. Keep names short.

Domain terms are in [GLOSSARY.md](GLOSSARY.md), decisions in [docs/adr](docs/adr).

## Project constraints

- **Scale.** Rupee should run as a hosted service: many users, decades of transactions per ledger. Never load a whole ledger per request or scan unbounded history in app code. Push selection, filtering and search into indexed queries.
- **Postgres, served or embedded.** The server connects to `DATABASE_URL` when it is set, and starts its own Postgres from portable-pg otherwise ([ADR 0004](docs/adr/0004-postgres-embedded-or-served.md)). Only use extensions portable-pg ships (pgvector, contrib).
- **Licensing.** Prefer MIT, BSD or Apache dependencies. Flag GPL and AGPL before suggesting one.
- **Pinned dependencies.** Add runtime dependencies with exact versions (`pnpm add -E`).

## Architecture

- **No singletons.** The context is built once by `createContext()` in `shared/context/environment.ts` and provided per request in `hooks.server.ts`. Functions declare what they need with `withContext('db')((db) => ...)` or `withContext('db', 'mailer')(({ db, mailer }) => ...)`. Callers don't thread `db` through parameters. Callback parameters use the key name verbatim.
- **Schema.** Drizzle declares tables, with `casing: 'snake_case'` and plural names; queries go through Kysely ([ADR 0018](docs/adr/0018-queries-with-kysely.md)). A new table also goes in `Tables`. Every table spreads `base`: a uuidv7 `id`, plus `created_at` and `updated_at`. A new table needs `select attach_updated_at()` in a custom migration. Natural keys are unique constraints, not the primary key. Fixed value sets use `pgEnum`.
- **Generic helpers go in `src/lib/server/shared/`**, not in the module that first needed them. If a helper would make sense without its module, it belongs in `shared/`.
- **Modules export only what's used outside them.** Values and functions get no `rupee` prefix.
- **Service function names and shapes** ([ADR 0016](docs/adr/0016-service-functions-names-and-shapes.md)). `find` looks up a row or a few, `list` returns many or a page, `read` fetches content from storage, `create` makes a record, and `save`, `delete` and `rename` change one. There is no `get`. An application function takes `ledger` alone or one options object, destructured in its parameters. Adapters are plain functions that take their dependency first, and the application imports them as a namespace (`DB.findLedger`). Endpoints take the name of the application function they call.

## Code style

### Symmetry

Code should be visually symmetric. Steps of an orchestrator, fields of a type, and files in a directory each sit at one level of abstraction and look alike. A piece that is smaller, longer, sparser or more complicated than its siblings usually means another level leaked in. The shape is how you spot it; the abstraction level is what you fix. Wrapping the leak in a one-line helper beside the orchestrator only hides it.

```ts
const updated = await userService.update(user, input);
await db.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [id]);
await eventBus.publish('user.updated', updated);
```

```ts
const updated = await userService.update(user, input);
await userService.recordLastSeen(id);
await eventBus.publish('user.updated', updated);
```

- Sibling modules share a shape: the same kind of input, the same output, the same form. `readGrid(upload)` and `readPdf(options)` both produce a `Grid`, but they take different inputs and are written differently. That's a break.
- A top-heavy function, with elaborate validation and a small tail of logic, is asymmetric. Parse input at the boundary when there is one. Otherwise extract validation into a named step at the same level.
- Asymmetry draws attention, so spend it on what matters. The structure should make the exception obvious without a comment.
- Prefer parallel code to shared helpers, until duplication raises the maintenance cost without making anything simpler.

### Layout

A blank line marks a shift in thinking. Lines that belong to one thought stay together, and a new thought starts after a blank line.

```ts
const WHITE = 0xffffffff;
const ANNOTATIONS = 0x01;

const wasm = createRequire(import.meta.url).resolve('@embedpdf/pdfium/pdfium.wasm');
```

- Group by the role a line plays, not where its value comes from: sources, then what's derived from them, then the result. In `raster` (`reader-pdf-pdfium.ts`), `scale` is the source, `width` and `height` are derived from it, and the bitmap below is what they build.
- Top-level multi-line declarations get a blank line between them. Inside a function, a matching pair (two predicates, two lookups) stays together even when one spans several lines. Single-line constants group by concept.
- A guard gets a blank line after it.
- In a longer body, a `return` gets a blank line before it when it does something different from the lines above. It stays attached when it just hands back what the line above built.
- A short function stays compact. Don't spread a two- or three-line body over five lines, since file size is a cost too. Split only on a real shift in thinking.
- Five or more lines in one group need a good reason. Otherwise split them, or extract a helper when part of the group builds one value.
- The same applies to object fields and test blocks.
- Order files most important first: constants, then exported entry points, then helpers. A type alias sits right above the function it describes.

### Composition

- Keep a composition at one level. When one stage of a pipeline or chain is bigger than the others, name it and define it above, so the composition reads `pipeline(source, track, sink)`.
- Pass dependencies in (such as a `logger`) instead of exposing callbacks that make the caller do the work.
- Read a single field with `const bytes = seen.bytes`. Destructure only when you need several fields.
- Use `Record` object literals for lookup tables. Use `Map` only when its methods earn it: dynamic keys from user data, frequent churn, or non-string keys.

### Control flow

- No `let`. Mutate a local array (`shift`, `splice`), iterate, or recurse instead of rebinding. In tests, use a Vitest fixture (`test.extend`) instead of `let` plus `beforeEach`.
- No `else if` or `else`. Write independent `if`s whose conditions are exclusive, or return early. When dropping an `else`, make sure the conditions really are exclusive.
- No braces around a single one-line statement: `if (x) return y;`. Keep braces when the statement spans several lines.

### Types

- Inference is fine. Name a type only when it's a contract someone has to follow: a port, a handle, or options callers pass.
- Prefer built-in or narrower types. Don't derive types (`ReturnType<typeof fn>`, `Omit<...> & {...}`).
- A type a schema describes is inferred from it (`v.InferOutput<typeof schema>`), so the schema stays its one definition.
- No type inheritance or intersections unless a library forces it.

### Comments

Avoid comments. Names and structure should explain the code, so when something seems to need a comment, rename or restructure it first. The only exception is a fact the code cannot show: an outside constraint (a model's input size), a library bug, a protocol quirk. No file headers.

A short JSDoc on a public interface is welcome, since it shows on hover. Keep it to one line, and don't restate what the name and types already say.

## Commits

Conventional commits with a lower-case subject, enforced by commitlint. Body lines are at most 72 characters.

Before committing, run `pnpm format:check`, `pnpm lint`, `pnpm check` and `pnpm test`.
