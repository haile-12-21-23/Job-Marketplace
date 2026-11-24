# JMP-29 — Linting, Formatting, Environment Validation & Test Tooling

**Project:** Job Marketplace (JMP)  
**Jira:** [JMP-29 — Configure linting, formatting, environment validation and test tooling](https://hailemariamaddisu21.atlassian.net/browse/JMP-29)  
**Repository:** pnpm monorepo  
**Packages:** `@jmp/web`, `@jmp/api`, `@jmp/contracts`, `@jmp/config`

## 1. Objective

Complete and standardize the project's developer-quality foundation. Ensure linting and formatting are consistently runnable from the repository root, preserve a shared strict TypeScript baseline, validate API environment variables before the server starts, and make the Vitest/Supertest test workflow predictable across the workspace.

This task builds on the completed work in JMP-24 through JMP-28. **Inspect the actual repository before changing configuration.** Keep working scripts and valid package conventions; close gaps rather than replacing the tooling wholesale.

## 2. Jira acceptance criteria

1. Root lint and format-check scripts work.
2. Strict TypeScript configuration is shared.
3. Environment variables are validated at startup.
4. Vitest and Supertest execute at least one sample test.

All four criteria must be demonstrated by executed commands and results before reporting completion.

## 3. Mandatory preflight — inspect before editing

From the repository root:

1. Record `git status --short` and the current branch. Do not discard, overwrite, or reformat unrelated user changes.
2. Inspect root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, workspace package manifests, `pnpm` version pin, Node version declaration, and all current root scripts.
3. Inspect all files under `packages/config` and the existing shared TypeScript presets. Determine the existing purpose of `@jmp/config` before adding or moving configuration.
4. Inspect all ESLint configuration files, Prettier configuration/ignore files, `.editorconfig`, all package `tsconfig*.json`, Vitest configuration and setup files, and existing tests.
5. Inspect `apps/api/src/server.ts`, `app.ts`, `config/database-config.ts`, Prisma infrastructure, `apps/api/prisma7.config.ts`, `.env.example`, package scripts, and `apps/api/README.md`.
6. Search the API for every `process.env` access and every use of the database URL or CORS/port/logging configuration. Find out when each value is read and whether secrets or connection strings can enter logs/errors.
7. Inspect `packages/contracts/package.json` and its Zod version. Do not move server-only settings into the browser-safe `@jmp/contracts` package.
8. Read the repository copies of `JMP_Architecture_Design_v1.0.pdf`, `JMP_API_Standards_v1.0.pdf`, `JMP_SRS_v1.0.pdf`, and `JMP_ERD_v1.0.pdf` when present. Preserve the approved architecture and API behavior.

Before implementation, summarize existing tooling and identify precisely which gaps need changes. If a required file or script already works, keep it rather than duplicating it.

## 4. Scope and implementation requirements

### 4.1 Root ESLint and Prettier workflow

- Establish or complete one consistent ESLint configuration usable by all applicable workspace packages. Preserve React/Vite, Node/Express, TypeScript, and test-file-specific rules where needed.
- Root `pnpm lint` must lint all relevant workspace source files or invoke every workspace package consistently. It must fail on lint errors; keep the existing zero-warning policy if already established.
- Establish or complete a shared Prettier configuration and `.prettierignore`.
- Add/verify root scripts:
  - `format` — format supported project files.
  - `format:check` — check formatting without modifying files.
- Exclude generated/build output, `node_modules`, coverage, generated Prisma client output, and migration artifacts from formatting/linting where appropriate. Do not ignore handwritten Prisma schema, migration SQL, configuration, or documentation merely to get a green check.
- Ensure lockfiles are handled consistently; do not run Prettier on `pnpm-lock.yaml`.
- Do not make sweeping, unrelated formatting-only changes. Apply formatting to files in scope and report any pre-existing out-of-scope formatting failures separately.

### 4.2 Shared strict TypeScript configuration

- Use the existing `@jmp/config` TypeScript preset structure where it already exists; do not create a competing set of base configs.
- Keep `strict: true` in the shared baseline and ensure both applications and shared packages extend the appropriate common preset.
- Preserve the different runtime module-resolution requirements:
  - API: NodeNext/ESM-compatible settings, consistent with the compiled `node dist/server.js` runtime and `.js` relative import specifiers.
  - Web: Vite/browser-compatible module resolution and JSX settings.
  - Contracts: compatible with both consumers and its emitted build/declarations.
- Keep package-specific options in child configs only where required. Do not flatten all projects into one incompatible `moduleResolution` or `lib` configuration.
- Run all workspace typechecks and fix genuine regressions introduced by the changes. Do not hide errors with broad `any`, `skipLibCheck`, or weakened strictness.

### 4.3 Centralized API environment validation

Create a single API-owned environment parsing boundary, preferably `apps/api/src/config/env.ts` unless repository inspection reveals an established equivalent.

Requirements:

- Parse and validate configuration once at the API process startup, before opening the database connection or starting the HTTP listener.
- Make the parser testable with an injected source object (for example `loadEnv(source = process.env)`) rather than requiring tests to mutate global `process.env`.
- Use Zod with the version already resolved by the workspace. If the API imports Zod directly, declare it correctly as an API dependency and retain one compatible resolved version in `pnpm-lock.yaml`; do not rely on an undeclared transitive dependency.
- Keep secrets and private runtime configuration out of `@jmp/contracts`, `apps/web`, and any browser-exposed `VITE_*` configuration.
- Validate only variables actually used by the current API. At minimum inspect and handle:
  - `NODE_ENV` (`development`, `test`, `production`) with a safe documented default if the current project supports one.
  - `PORT` as an integer in the valid TCP port range, with the existing default preserved.
  - `DATABASE_URL` as a valid PostgreSQL connection URL (`postgres:` or `postgresql:`); do not log its raw value.
  - `CORS_ORIGINS` as a normalized, trimmed allowlist consistent with the current API CORS middleware and `.env.example`.
  - `LOG_LEVEL` if the logger currently reads it; validate only if used.
- Preserve existing behavior and defaults unless the architecture/API standards require otherwise. Document which values are required versus optional.
- On invalid configuration, fail fast with a clear, sanitized message naming the invalid variable and safe validation reason. Never include the supplied value, URL, username, password, query parameters, access tokens, or secrets in thrown messages, logs, stack annotations, or test snapshots.
- Avoid logging the entire environment object. Keep validation diagnostics useful but redacted.
- Ensure the valid parsed configuration is typed and is the source of truth for server startup, database initialization, CORS, port, and logger configuration. Remove duplicate parsing/validation paths.
- Replace the temporary `apps/api/src/config/database-config.ts` guard from JMP-27 with the centralized configuration boundary. Preserve useful database URL tests by moving/adapting them; avoid two competing validators. Update all imports and tests.
- Keep `createApp()` pure: importing or constructing the Express app must not parse environment variables, connect to PostgreSQL, or create process/listen side effects.
- The process entry point (`server.ts`) must validate environment configuration before connecting to PostgreSQL and before opening the HTTP listener.
- Ensure the Prisma 7 CLI config and migration commands continue to read the correct database URL in the established local workflow. Do not introduce import-time API server startup into `prisma7.config.ts`.
- Keep `.env.example` synchronized with the validated variable names and safe placeholders. Never add a real `.env` file, credentials, or connection secrets to Git.
- If development `.env` loading is required, preserve the current established mechanism or use an explicit, deterministic approach that runs before configuration parsing. Production should use the process environment supplied by the deployment platform.

### 4.4 Vitest and Supertest test tooling

- Preserve and standardize the existing Vitest setup. Use the correct environment per package (`node` for API/contracts, `jsdom` for React web tests) and keep setup files narrowly scoped.
- Ensure root `pnpm test` runs the relevant workspace tests and returns a non-zero exit code on failure. Keep a separate watch script if already present.
- Ensure the API's Supertest tests exercise the exported pure `createApp()` without listening on a real network port or connecting to a real database.
- At minimum add/retain tests demonstrating:
  1. Valid API environment values parse to the expected typed config.
  2. Invalid/missing required values fail validation with sanitized messages and no secret leakage.
  3. A malformed `DATABASE_URL` is rejected without echoing credentials or the raw URL.
  4. An API sample HTTP route (for example `GET /api/v1`) can be tested through Vitest + Supertest using `createApp()`.
- Keep tests deterministic and isolated. Do not require a developer's local PostgreSQL service for ordinary unit or Supertest tests. Database integration tests should remain explicitly separate and only run when configured.
- Ensure `@types/supertest` or equivalent types are declared where needed, without adding redundant dependencies.

### 4.5 Root scripts and developer experience

Review and standardize the root scripts without deleting useful existing commands. At minimum ensure root-level commands exist and are documented:

- `pnpm lint`
- `pnpm format`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm check` (the agreed aggregate quality check; include lint, format-check, typecheck and tests if consistent with the current workspace flow)
- `pnpm workspace:check`

Keep package-scoped scripts where appropriate. Ensure scripts use pnpm workspace filters consistently and do not invoke themselves recursively. Update root README and `apps/api/README.md` with the canonical commands and environment setup.

## 5. Compatibility and security guardrails

- Preserve all completed work from JMP-24, JMP-25, JMP-26, JMP-27, and JMP-28.
- Do not alter the Prisma domain model or migration history.
- Do not change the public API response envelope, RFC 9457 error contract, request ID behavior, or CORS policy semantics.
- Do not add authentication, authorization, feature routes, business logic, or UI functionality.
- Keep API env values server-only. Do not prefix private API configuration with `VITE_`.
- Never commit real secrets or output them in logs/test failures.
- Do not weaken TypeScript strictness, silence lint rules globally, or add broad ignore patterns to make checks pass.
- Avoid unnecessary major dependency upgrades. Keep the repository's pinned Node/pnpm versions and use compatible package versions.

## 6. Explicit out of scope

- Feature-specific auth, employer, job, candidate, application, and notification schemas/endpoints.
- New OpenAPI generation or route-level validation middleware (unless an existing narrow helper must be updated to compile; do not build a feature-wide validation layer here).
- React Router, Redux Toolkit, or RTK Query (JMP-30).
- Docker Compose and API health/readiness routes (JMP-31).
- GitHub Actions CI pipeline (JMP-32).
- Production deployment, secret management service, or infrastructure provisioning.
- Changes to the approved ERD or Prisma business model.

## 7. Required verification

Run the commands supported by the repository and include the exact output/exit status in the handoff. At minimum:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm workspace:check
pnpm check
```

Run focused API checks as well:

```bash
pnpm --filter @jmp/api lint
pnpm --filter @jmp/api typecheck
pnpm --filter @jmp/api test
pnpm --filter @jmp/api build
```

Environment validation checks:

- Valid local development configuration parses successfully.
- Invalid `PORT`, `NODE_ENV`, `DATABASE_URL`, and invalid CORS origin input are rejected as designed.
- Failure happens before database connect/listen.
- Error/log output does not contain a supplied database URL, username, password, or test secret.
- `createApp()` remains importable/testable without environment variables and without a live database.

Supertest check:

- Use `request(createApp())` (or the repository's equivalent) to verify the expected sample route without starting a separate listener.

Also manually verify the local developer workflow if available:

```bash
pnpm --filter @jmp/api dev
```

Do not claim a database-backed server startup unless the database is actually available and the command was executed. Do not run destructive commands such as `prisma migrate reset`.

## 8. Completion handoff format

When finished, provide:

1. Summary of inspected existing tooling and what was changed versus retained.
2. Files created/modified, grouped by ESLint/Prettier, TypeScript, env validation, and test tooling.
3. Final root/package scripts and the canonical developer commands.
4. Environment variables validated, defaults/required status, and redaction behavior.
5. How `server.ts`, Prisma infrastructure and `createApp()` interact after the changes.
6. Test coverage added/updated, especially env tests and Supertest route test.
7. Exact verification commands, pass/fail, counts, and any limitations.
8. Confirmation that Prisma schema/migrations, public API contracts, and browser-safe package boundaries were preserved.
9. Any remaining issue or follow-up, without marking incomplete checks as passed.

**Do not mark JMP-29 complete until all Jira acceptance criteria and the required verification above are demonstrated.**
