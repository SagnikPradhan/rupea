# A server process, and a web app that calls it

Rupea has to run as a hosted service and as an app people install, and the web app should not be the only way in. So the server is a process of its own, a Fastify host in `packages/server`, and the SvelteKit app is a client of it. The app's remote functions are its backend for frontend (BFF): they take what a page sends, call the API, and shape the answer for the page. They no longer import any server code.

**The contract is a package.** `packages/contract` (`@rupea/contract`) declares every procedure once: its route, its input, its output and the errors it answers. The server implements it and the web app calls it, so neither can drift from the other. The packages depend on each other in one direction, `shared <- contract <- {server, web}`, and a lint rule (`lint/package-boundaries.ts`) refuses an import that points the other way.

**oRPC carries the contract and nothing else.** It builds the routes, the client and the OpenAPI document. Application code never imports it. A handler in `packages/server/src/api` calls an application function and turns its `ResultAsync` into an answer. The services do not know there is a wire.

**One wire: REST with an OpenAPI document.** A call is a plain HTTP request, such as `GET /api/auth/user`, and `/api/openapi.json` describes all of them. The web app uses the typed client. Anything else can use the document.

**Sessions are opaque bearer tokens.** `signIn` trades a mailed code for a token and an expiry, and later calls send the token as `Authorization: Bearer`. The server stores only its hash. The API sets no cookie. The web app keeps the token in an `httpOnly` cookie of its own, which is the job of the BFF, and `findUser` answers a new expiry when a call extended the session, so the BFF can set the cookie again.

**Wire schemas decode on the way in and encode on the way out.** A `Day` comes in as `2026-10-21` and is a `Temporal.PlainDate` inside; `DayOut` writes it back as text. The same schemas describe the OpenAPI document, so a client sees strings with a format, not the transform.

**One error model.** Every failure is a `RupeaError`, a valibot schema in `@rupea/shared`, and the contract carries it as the data of an oRPC error. One table, `STATUS` in `packages/contract/src/errors.ts`, gives each variant its status: 401 unauthenticated, 404 not found, 409 conflicts, 422 faults of the input or the ledger, 500 unknown or infrastructure, 502 a feed that failed. A 500 leaves the server as a generic `UnknownError`, since the real message names paths and internals; the real error is logged. The BFF turns an answer back into the `Reply` the pages already read.

**A batch answers 200.** A procedure that works through many things returns `{ succeeded, failed }`. One account whose return cannot be solved does not hide the rest.

**The licence follows the packages.** `@rupea/shared` and `@rupea/contract` are MIT, each with its own `LICENSE`, so anyone can build a client against them. The contract imports shared, so shared cannot be under a stronger licence.

## Considered Options

- **GraphQL**: a client chooses its fields, but the pages already know what they need, and every query would need its own cost limit to keep a hosted service safe. A route per procedure is easier to cache, log and rate limit.
- **Cookie sessions on the API**: the browser would call the API itself, which needs CORS and protection against forged requests, and ties the API to browsers. A bearer works the same for the web app, a script and a future client.
- **Staying in one process**: nothing to run twice, but the web app and the services cannot scale, restart or deploy apart, and nothing else could call them.
- **tRPC**: typed end to end, but it is a TypeScript-to-TypeScript protocol with no OpenAPI document, so a client in another language would start from nothing.

## Consequences

- Running Rupea is two processes. `pnpm dev` and `pnpm start` run both, and the web app needs only `RUPEA_API_URL`.
- Past your own machine, the API URL must be `https`, as the token travels in every call.
- A procedure is added in three places: the contract, a handler, and a test in `packages/server/src/tests`.
- The web app holds no database, storage or models, so it stays small and can have no Node-only imports.
- Uploads go from the browser to the BFF and from there to the API as multipart, so a statement crosses two hops.
- Throttling sign-in and roles for members are not done yet, and are needed before the API is public.
