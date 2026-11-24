# JMP-26 — Bootstrap the Express + TypeScript API

**Project:** Job Marketplace (JMP)  
**Jira:** [JMP-26 — Bootstrap Express and TypeScript API application](https://hailemariamaddisu21.atlassian.net/browse/JMP-26)  
**Workspace package:** `@jmp/api`  
**Execution:** Antigravity CLI, from the repository root  
**Scope:** API application foundation only. Do not implement database, authentication, shared Zod contracts, full health probes, or API documentation in this task; those have their own Jira issues.

---

## 1. Your role and operating rules

Act as a senior TypeScript backend engineer. Read this file completely, inspect the actual repository, and implement JMP-26 in the existing monorepo.

Before editing:

1. Confirm you are at the `job-marketplace` repository root and inspect `git status`.
2. Read the root `package.json`, `pnpm-workspace.yaml`, `apps/api/package.json`, `apps/api/tsconfig.json`, `packages/config/typescript/node.json`, the existing ESLint/Vitest configuration, and the API app's current source files.
3. Read the repository's copies of `JMP_Architecture_Design_v1.0` and `JMP_API_Standards_v1.0` if present. Also consult the SRS if it is available. Do not overwrite unrelated work or revert existing user changes.
4. Keep the implementation consistent with the existing monorepo and the approved architecture. Do not create a second repository or a parallel API app.

If a detail in this brief conflicts with an existing, more recent repository decision, preserve the repository decision and explain the discrepancy in the handoff. Do not silently change root toolchain versions or package-manager configuration.

## 2. Approved technical baseline

Use the current workspace baseline:

- Node.js version pinned by the repository (currently `>=24.22.0`).
- pnpm pinned by the root package manifest (currently `pnpm@12.17.0`).
- TypeScript with strict mode inherited from `@jmp/config/typescript/node.json`.
- ESM (`"type": "module"`) and NodeNext module resolution, matching the current workspace packages.
- Express 5 compatible with the installed Node/TypeScript toolchain.
- `helmet` for baseline HTTP security headers.
- `cors` with an explicit origin allowlist.
- `pino` for structured server logging.
- `tsx` for local TypeScript watch-mode development.
- Vitest, already provided by the workspace, plus Supertest for HTTP-level app tests where required.

Use current stable, mutually compatible package releases and add dependencies to **`apps/api` only** unless a genuine shared-tooling change is required. Preserve the existing `@jmp/api` package name and `workspace:*` links. Do not install a second TypeScript, ESLint, Prettier, or Vitest version in the API package when the root already owns it.

## 3. Exact scope

Create a maintainable Express application that can be developed, built, started, and tested independently of the React web client.

Suggested structure (adapt to the repo's conventions where appropriate):

```text
apps/api/
├── src/
│   ├── app.ts                    # Express app factory; no listen side effect
│   ├── server.ts                 # Process entry point; listen + graceful shutdown
│   ├── routes/
│   │   ├── index.ts              # Root router
│   │   └── v1/
│   │       └── index.ts          # Versioned API router
│   ├── middleware/
│   │   ├── request-id.ts
│   │   ├── not-found.ts
│   │   └── error-handler.ts
│   ├── errors/
│   │   └── app-error.ts
│   ├── observability/
│   │   └── logger.ts
│   └── app.test.ts
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
└── package.json
```

Do not create placeholder domain modules for jobs, users, employers, applications, or admin in this task. Their module boundaries are described in the architecture baseline and they will be introduced in their implementation tasks.

## 4. Express application requirements

### 4.1 Application factory and process entry point

- Export a `createApp()` function from `src/app.ts` that constructs and returns an Express application.
- Importing `app.ts` must not open a network port, register process signal handlers, or start background work. This is required for reliable integration tests.
- `src/server.ts` is the only process entry point. It imports `createApp()`, reads the port (default `3000`), starts the HTTP server, and logs the listening address.
- Add graceful handling for `SIGINT` and `SIGTERM`: stop accepting new connections, close the HTTP server, and exit cleanly. Avoid complex database shutdown hooks because there is no database client in this issue.
- Add process-level handling in `server.ts` for `unhandledRejection` and `uncaughtException`. Log the failure with Pino, initiate a bounded graceful shutdown, and terminate with a non-zero exit status. An uncaught exception is fatal; do not continue serving requests in an unknown process state.
- Make shutdown idempotent so simultaneous signals/fatal events do not attempt to close the server multiple times. Set a reasonable shutdown timeout and force termination only if the server cannot close.
- Do not register process handlers when `app.ts` is imported. Do not call `process.exit()` on normal successful shutdown before the server has closed. Handle startup/listen errors clearly.

### 4.2 Middleware order

Use a deliberate, documented order so request IDs and errors work consistently:

1. Disable the `X-Powered-By` header.
2. Request ID middleware.
3. Structured request logging (do not log credentials or request bodies).
4. `helmet()`.
5. CORS configured with an explicit allowlist.
6. JSON body parser with a conservative size limit (for example, 1 MB).
7. Root and `/api/v1` routers.
8. Not-found handler.
9. Central error handler (must be last).

For CORS:

- Default the local web origin to `http://localhost:5173`.
- Support configuration of one or more exact origins using a simple environment variable such as `CORS_ORIGINS` (comma-separated is acceptable for this bootstrap).
- Do not use `*` when credentials are enabled. Reject or omit CORS headers for unlisted browser origins.
- Requests without an `Origin` header (for example, curl or server-to-server calls) should remain usable.
- Keep full typed environment parsing/validation for JMP-29; do not introduce a second Zod environment schema here.

### 4.3 Request correlation and logging

- Generate a request ID using Node's cryptographic UUID support when a safe incoming `X-Request-Id` is not supplied.
- Validate incoming request IDs with a restrictive allowlist and maximum length before echoing them. Never reflect arbitrary header content.
- Return the ID in the `X-Request-Id` response header and include it in request/error logs.
- Use structured JSON logging through Pino. Log method, route/path, status code, request ID, and duration. Do not log authorization headers, cookies, passwords, tokens, resume data, or request bodies.
- Keep logger construction in one module so it can later be replaced/configured without changing route handlers.

### 4.4 API root and version router

- Mount all product endpoints under `/api/v1`, consistent with JMP API Standards v1.0.
- Add a small `GET /api/v1` informational response so developers can verify that the API process and router are running. Use the standard success envelope `{ "data": { ... } }` and include service name and API version.
- A simple `GET /` may return service metadata or a short link/message directing to `/api/v1`; do not expose environment variables, secrets, filesystem details, or stack traces.
- Do **not** add `/health`, `/health/live`, `/health/ready`, or database health probes. Those are covered by JMP-31.
- Do not add real product endpoints or business logic.

## 5. Error handling contract

Follow the approved API standards: errors use `application/problem+json` and the RFC 9457 problem-details shape, extended with stable application `code` and `requestId` fields.

Example shape:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "The requested route was not found.",
  "instance": "/api/v1/unknown",
  "code": "ROUTE_NOT_FOUND",
  "requestId": "a-valid-request-id"
}
```

Requirements:

- Add a small typed `AppError` (or equivalent) for expected HTTP errors with `statusCode`, stable `code`, safe public `message`, and optional safe extension data.
- Unknown errors must become a generic 500 problem response. Never send stack traces, database details, or internal exception messages to clients in production responses.
- Add a not-found handler that returns a 404 problem response.
- Map malformed JSON body-parser errors to a safe 400 problem response and oversized bodies to 413. Do not expose parser internals.
- Ensure the error handler is typed for the installed Express version and has the four-argument Express error-handler signature.
- Log server-side errors with request ID and error context, but redact secrets.
- Avoid swallowing errors or writing a second response after headers have been sent.
- Keep a clear place for future Zod validation errors from JMP-28; do not add business request schemas in this issue.

## 6. TypeScript, ESM, and build configuration

- Keep `apps/api/tsconfig.json` extending the shared Node preset. Preserve strict compiler options.
- Add a separate `tsconfig.build.json` if needed so production compilation emits JavaScript to `dist/` while the existing `typecheck` remains `noEmit`.
- Configure the build to include runtime `.ts` files and exclude tests/test setup from production output.
- With NodeNext ESM, use correct `.js` import specifiers in relative TypeScript imports where required by the compiler/runtime. Confirm the compiled output starts under Node; do not rely only on `tsx` working in development.
- Do not weaken `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, or other shared compiler options to make the code compile.

## 7. Package scripts

Update `apps/api/package.json` and preserve its existing `lint`, `typecheck`, and `test` scripts. Add at least:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js"
  }
}
```

Adapt only if the chosen compatible runner/build approach requires it; document the reason. Ensure the root `pnpm check` remains valid and the API build is run separately or included in a suitable root build script only if that does not disrupt other packages.

Expected developer commands from repository root:

```bash
pnpm --filter @jmp/api dev
pnpm --filter @jmp/api build
pnpm --filter @jmp/api start
pnpm --filter @jmp/api test
pnpm check
```

Expected local default base URL is `http://localhost:3000`, with the API version prefix at `http://localhost:3000/api/v1`.

## 8. Tests required

Use the existing Vitest configuration and Supertest (or the repository's established HTTP test helper). Test the exported app factory directly; tests must not need to bind a real port.

At minimum, cover:

1. `GET /api/v1` returns HTTP 200 and the expected `{ data: ... }` envelope.
2. The response includes a valid `X-Request-Id`.
3. A safe supplied `X-Request-Id` is preserved, and an invalid one is replaced.
4. An unknown route returns 404 with `application/problem+json`, stable `code`, and request ID.
5. Malformed JSON returns a safe 400 problem response.
6. Server errors do not expose internal exception messages or stack traces.
7. CORS allows the configured local web origin and does not grant wildcard access to arbitrary origins.
8. Route registration is modular: adding a new router to the root/version router does not require editing middleware or server startup code.

Keep tests focused on bootstrap behavior. Do not add fake domain tests for functionality that does not exist yet.

## 9. Documentation

Update the root README or add `apps/api/README.md` with:

- Purpose of `@jmp/api`.
- Required Node/pnpm versions (reference the root pins; do not duplicate contradictory versions).
- Install command if already documented at root.
- API development, build, production start, test, and root check commands.
- Default local port and `/api/v1` base path.
- A note that health/readiness probes, database connection and migrations are implemented in later tickets.

Do not add real secrets. Keep `.env.example` placeholders only if consistent with JMP-29 and the existing repository.

## 10. Explicitly out of scope — do not implement now

These have separate planned Jira tasks. Avoid doing their work in JMP-26:

- Prisma schema, database client, migrations, PostgreSQL container/service: **JMP-27 / JMP-31**.
- Zod domain/request/response contracts in `@jmp/contracts`: **JMP-28**. Keep a clean integration point, but do not invent the final shared schemas.
- Full environment validation and common tooling policy changes: **JMP-29**. Only use minimal bootstrap defaults needed to run the server.
- React Router, Redux Toolkit, RTK Query: **JMP-30**.
- Liveness/readiness endpoints and local Docker development services: **JMP-31**.
- GitHub Actions workflow: **JMP-32**.
- JWT authentication, refresh sessions, CSRF, permissions, users/employers/jobs/applications business modules: later implementation sprints.
- Swagger UI or full OpenAPI generation: already specified in JMP-20; implement when the API route/contracts integration work is scheduled, not as a duplicate in this bootstrap.

## 11. Verification checklist — do not mark done until these pass

From repository root:

```bash
pnpm install
pnpm --filter @jmp/api lint
pnpm --filter @jmp/api typecheck
pnpm --filter @jmp/api test
pnpm --filter @jmp/api build
pnpm check
```

Then run the API:

```bash
pnpm --filter @jmp/api dev
```

In a second terminal, verify:

```bash
curl -i http://localhost:3000/api/v1
```

Also verify the production build can be started (stop the dev server first):

```bash
pnpm --filter @jmp/api start
```

If any command fails, fix the issue and rerun the relevant checks. Do not claim success for checks that were not actually run. Keep `pnpm-lock.yaml` synchronized and include it in the handoff if dependencies changed.

## 12. Completion handoff

When implementation and verification are complete, create a concise handoff file named `JMP-26-handoff.md` in the Antigravity CLI task handoff location and summarize:

- Files created/updated.
- Installed runtime and development dependencies with versions.
- API route and middleware order.
- Decisions made and any deviations from the approved baseline.
- Exact verification commands and pass/fail results.
- Local run commands and URL.
- Any remaining warnings or deferred items.

Do not mark Jira JMP-26 as Done yourself unless specifically asked. The requester will share the handoff and test output so acceptance can be reviewed and Jira updated.

---

**Primary objective:** deliver a clean, strictly typed, independently runnable Express API foundation inside the existing `@jmp/api` workspace package, with safe middleware, centralized errors, repeatable tests, and a production build—without pulling later sprint scope forward.
