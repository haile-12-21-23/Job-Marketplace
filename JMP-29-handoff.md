# JMP-29 Implementation Handoff — Developer Tooling & Environment Validation

**Jira Issue:** [JMP-29 — Configure linting, formatting, environment validation and test tooling](https://hailemariamaddisu21.atlassian.net/browse/JMP-29)  
**Branch:** `JMP-29-Configure-linting-formatting-environment-validation-and-test-tooling`  
**Date:** 2026-11-24  
**Status:** COMPLETE & FULLY VERIFIED  

---

## 1. Executive Summary & Preflight Inspection

A full preflight audit of the pnpm monorepo was conducted before applying changes:
- **Inspected Tools & Workspaces:**
  - Workspace packages: `@jmp/config`, `@jmp/contracts`, `@jmp/api`, `@jmp/web`.
  - Pinned runtime versions: Node `>=24.22.0` (active: `v24.22.3`), pnpm `12.17.0`.
  - ESLint: Flat configuration (`eslint.config.mjs`) leveraging `@eslint/js` and `typescript-eslint`.
  - Shared TypeScript presets: `packages/config/typescript/{base,node,web}.json` configured with strict mode (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, etc.).
  - Database & Prisma: Prisma 7 (`7.10.1`) with `PrismaPg` adapter and local migration `20261124110222_init`.
- **Tooling Retained:**
  - `@jmp/config` shared presets for Node and Web module resolutions.
  - Zero-warning ESLint policy (`--max-warnings=0`).
  - Vitest per-package configurations (`node` environment for API/contracts/config, `jsdom` for web).
  - Pure Express app factory structure (`createApp()`) in `apps/api/src/app.ts`.
- **Gaps Identified & Addressed:**
  - Missing Prettier configuration: Added `.prettierrc.json` and `.prettierignore` with root scripts `format` and `format:check`. Integrated `format:check` into root `pnpm check`.
  - Temporary validator replacement: Replaced minimal `database-config.ts` from JMP-27 with centralized, strongly typed Zod environment validation in `apps/api/src/config/env.ts`.
  - Environment purity: Removed `process.env['CORS_ORIGINS']` lookup from `createApp()`. `createApp()` now accepts optional `AppOptions` with `{ corsOrigins?: string[] }`, ensuring 100% purity and zero environment coupling during testing.
  - Startup boundary: `server.ts` validates environment variables before initiating database connection or binding HTTP server listener, fast-failing with sanitized diagnostic issues on invalid inputs.

---

## 2. Jira Acceptance Criteria Verification

| Jira Acceptance Criterion | Status | Evidence / Verification Method |
| :--- | :---: | :--- |
| **1. Root lint and format-check scripts work** | **PASS** | `pnpm lint` passed with 0 warnings across all 4 packages.<br>`pnpm format:check` passed with all matched files adhering to Prettier rules. |
| **2. Strict TypeScript configuration is shared** | **PASS** | All workspace packages extend `@jmp/config/typescript/{node,web}.json`.<br>`pnpm typecheck` passed with 0 errors across `@jmp/config`, `@jmp/contracts`, `@jmp/api`, and `@jmp/web`. |
| **3. Environment variables are validated at startup** | **PASS** | Validated at API process startup in `server.ts` via `loadEnv()` using Zod (`3.25.76`).<br>Tested with invalid inputs (`PORT=99999`, malformed `DATABASE_URL`); process exited with code 1, logged structured errors, and zero credentials leaked. |
| **4. Vitest and Supertest execute sample tests** | **PASS** | Vitest executed across all workspace packages: **13 test files passed, 89 tests passed**.<br>Supertest executed 12 tests against pure `createApp()` without live network port or DB requirement (`GET /api/v1` HTTP 200, CORS, 404 problem details, malformed JSON). |

---

## 3. Files Created, Modified, and Deleted

### 3.1 ESLint & Prettier
- **Created `.prettierrc.json`**: Root Prettier formatting configuration (single quotes, 2 spaces indentation, 100 print width, trailing commas).
- **Created `.prettierignore`**: Ignores lockfiles (`pnpm-lock.yaml`), build output (`dist/`, `coverage/`), generated Prisma client (`apps/api/src/generated/`), wireframes (`*.html`), and PDFs (`*.pdf`).
- **Modified `eslint.config.mjs`**: Excluded `**/apps/api/src/generated/**` and scoped rules to TypeScript source files.
- **Modified `package.json`**: Added `"format": "prettier --write ."` and `"format:check": "prettier --check ."`. Updated `"check"` script to include `pnpm run format:check`.

### 3.2 Environment Validation & Startup Boundary
- **Created `apps/api/src/config/env.ts`**:
  - Implements `loadEnv(source = process.env): ApiConfig`.
  - Defines `EnvironmentValidationError` carrying sanitized issues array.
  - Validates `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGINS`, and `LOG_LEVEL`.
  - Redacts all secrets, usernames, passwords, and raw URLs on error.
- **Created `apps/api/src/config/env.test.ts`**:
  - 16 comprehensive unit tests covering defaults, valid values, invalid port ranges, invalid schemes, missing host/database name, and credential redaction.
- **Modified `apps/api/src/server.ts`**:
  - Validates environment before database connection and HTTP listener.
  - Exits with code 1 and structured fatal log on validation failure.
  - Injects `config.corsOrigins` into `createApp()` and `config.databaseUrl` into `connectDatabase()`.
  - Dynamically configures `logger.level = config.logLevel`.
- **Modified `apps/api/src/infrastructure/database/prisma.ts`**:
  - Updated to import `loadEnv` instead of `database-config.ts`.
  - Accepts optional `databaseUrl?: string` parameter in `getPrismaClient()` and `connectDatabase()`.
- **Deleted `apps/api/src/config/database-config.ts`**: Obsolete temporary guard removed.
- **Deleted `apps/api/src/config/database-config.test.ts`**: Obsolete tests removed (covered in `env.test.ts`).
- **Modified `apps/api/.env.example`**: Synchronized with all validated variables (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `DATABASE_URL`, `SHADOW_DATABASE_URL`).
- **Modified `apps/api/package.json`**: Added direct dependency `"zod": "^3.25.76"`.

### 3.3 Express App Purity & Test Tooling
- **Modified `apps/api/src/app.ts`**:
  - Defined `export interface AppOptions { corsOrigins?: string[]; }`.
  - Converted `createApp(options?: AppOptions)` to be 100% pure with zero `process.env` dependencies.
  - Defaults allowed CORS origins safely to `['http://localhost:5173']`.
- **Modified `apps/api/src/app.test.ts`**:
  - Added test validating pure `createApp({ corsOrigins: [...] })` configuration without `process.env`.

### 3.4 Documentation
- **Modified `README.md`**: Updated root command documentation table to include Prettier formatting and updated check sequence.
- **Modified `apps/api/README.md`**: Updated architecture notes to reference `src/config/env.ts`.

---

## 4. Environment Variables Specification

| Variable Name | Type / Allowed Values | Default Value | Required? | Validation Rules & Redaction Behavior |
| :--- | :--- | :--- | :---: | :--- |
| `NODE_ENV` | `'development' \| 'test' \| 'production'` | `'development'` | No | Must match one of the three environment modes. |
| `PORT` | Integer (`1` - `65535`) | `3000` | No | Coerced from string; rejected if outside valid TCP port range. |
| `DATABASE_URL` | PostgreSQL connection URL string | None | **Yes** | Must start with `postgresql:` or `postgres:`. Must contain hostname and database name path. **Redacted**: credentials, raw URL, and query parameters are never echoed in error messages. |
| `CORS_ORIGINS` | Comma-separated list of URLs | `'http://localhost:5173'` | No | Parsed into array of trimmed strings. Must use `http:` or `https:` scheme. |
| `LOG_LEVEL` | `'fatal' \| 'error' \| 'warn' \| 'info' \| 'debug' \| 'trace' \| 'silent'` | `'info'` | No | Standard Pino log levels. |
| `SHADOW_DATABASE_URL` | PostgreSQL connection URL string | None | No (Dev only) | Optional shadow database connection URL used by Prisma Migrate during dev migration diffing. |

---

## 5. Interaction Flow Between `server.ts`, Prisma, and `createApp()`

```
process start (pnpm dev / start)
     │
     ▼
[dotenv/config] loads .env (development only)
     │
     ▼
[server.ts] calls loadEnv(process.env)
     ├── Validation Fails ──> logger.fatal({ issues }) ──> process.exit(1)
     └── Validation Succeeds
             │
             ├── Set logger.level = config.logLevel
             │
             ├── createApp({ corsOrigins: config.corsOrigins })
             │     └── Pure Express setup (no DB, no port, no env reads)
             │
             ├── connectDatabase(config.databaseUrl)
             │     └── getPrismaClient(url) ──> Pool verification ('SELECT 1')
             │
             └── server.listen(config.port)
                   └── Serves HTTP traffic on port
```

**Purity in Tests:**  
When tests import and invoke `createApp()`, no environment parsing occurs, no database pool is instantiated, and no ports are bound. Supertest binds to the Express app via an ephemeral in-memory socket.

---

## 6. Verification Commands & Exact Results

### 6.1 Root Monorepo Quality Check (`pnpm check`)
Command: `pnpm check`
```bash
$ pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test

$ prettier --check .
Checking formatting...
All matched files use Prettier code style!

$ pnpm --recursive --if-present run lint
packages/config lint$ eslint src --max-warnings=0 (Done in 662ms)
packages/contracts lint$ eslint src --max-warnings=0 (Done in 398ms)
apps/api lint$ eslint src --max-warnings=0 (Done in 488ms)
apps/web lint$ eslint src --max-warnings=0 (Done in 536ms)

$ pnpm --recursive --if-present run typecheck
packages/config typecheck$ tsc --noEmit -p tsconfig.json (Done in 235ms)
packages/contracts typecheck$ tsc --noEmit -p tsconfig.json (Done in 620ms)
apps/api typecheck$ tsc --noEmit -p tsconfig.json (Done in 1.8s)
apps/web typecheck$ tsc --noEmit -p tsconfig.json (Done in 1.8s)

$ pnpm --recursive --if-present run test
packages/config test:  1 test passed
packages/contracts test: 38 tests passed
apps/api test:        37 tests passed
apps/web test:        13 tests passed

Total: 13 test files passed, 89 tests passed, 0 failures.
Exit code: 0
```

### 6.2 Workspace Structure & Dependency Graph (`pnpm workspace:check`)
Command: `pnpm workspace:check`
```
Workspace structure OK (4 packages; all workspace:* references resolve).
Exit code: 0
```

### 6.3 Focused API Verification (`@jmp/api`)
Command: `pnpm --filter @jmp/api lint && pnpm --filter @jmp/api typecheck && pnpm --filter @jmp/api test && pnpm --filter @jmp/api build`
```bash
$ eslint src --max-warnings=0
$ tsc --noEmit -p tsconfig.json
$ vitest run --passWithNoTests
  ✓ src/config/env.test.ts (16 tests)
  ✓ src/contracts.test.ts (6 tests)
  ✓ src/infrastructure/database/prisma.test.ts (2 tests)
  ✓ src/index.test.ts (1 test)
  ✓ src/app.test.ts (12 tests)
  Test Files: 5 passed (5)
  Tests: 37 passed (37)
$ prisma generate --config prisma7.config.ts
  Generated Prisma Client (7.10.1) to ./src/generated/prisma in 165ms
$ tsc -p tsconfig.build.json
Exit code: 0
```

### 6.4 Startup Environment Validation & Security Redaction Checks
**Test A: Invalid TCP Port (`PORT=99999`)**
```bash
$ PORT=99999 node apps/api/dist/server.js
{"level":60,"time":1795525376088,"issues":[{"field":"PORT","message":"PORT must be between 1 and 65535"},{"field":"DATABASE_URL","message":"DATABASE_URL is required"}],"msg":"Environment validation failed — aborting server startup"}
Exit code: 1
```

**Test B: Malformed `DATABASE_URL` with Secret Redaction**
```bash
$ DATABASE_URL="postgresql://user:super_secret_password_123@badhost:5432/" node apps/api/dist/server.js
{"level":60,"time":1795525382153,"issues":[{"field":"DATABASE_URL","message":"DATABASE_URL is missing a database name in the path"}],"msg":"Environment validation failed — aborting server startup"}
Exit code: 1
# Confirmed: "super_secret_password_123" does not appear in stdout, stderr, or JSON logs.
```

### 6.5 Compiled Production API Smoke Test
Command: `PORT=3005 pnpm --filter @jmp/api start`
```bash
$ node dist/server.js
{"level":30,"time":1795525350272,"msg":"Database connection established successfully"}
{"level":30,"time":1795525350273,"port":3005,"msg":"Job Marketplace API listening on port 3005"}
```
Endpoint test via curl:
```bash
$ curl -i http://localhost:3005/api/v1
HTTP/1.1 200 OK
X-Request-Id: 140f1362-bc50-4d58-b688-5bea0e69ecd8
Content-Type: application/json; charset=utf-8
Content-Length: 71

{"data":{"service":"Job Marketplace API","version":"v1","status":"ok"}}
```

### 6.6 Local Development Server Workflow (`pnpm --filter @jmp/api dev`)
Command: `PORT=3006 pnpm --filter @jmp/api dev`
```bash
$ tsx watch src/server.ts
{"level":30,"time":1795525460380,"msg":"Database connection established successfully"}
{"level":30,"time":1795525460381,"port":3006,"msg":"Job Marketplace API listening on port 3006"}

$ curl -s http://localhost:3006/api/v1
{"data":{"service":"Job Marketplace API","version":"v1","status":"ok"}}
```

---

## 7. Scope Boundaries & Non-Regressions

- **Prisma Schema & Migrations:** Untouched. Existing schema (`prisma/schema.prisma`) and initial migration (`20261124110222_init`) remain unchanged.
- **Public API Contracts:** RFC 9457 Problem Details error handling, X-Request-Id middleware, and `GET /api/v1` data envelopes remain 100% compliant.
- **Package Isolation:** `@jmp/contracts` contains zero server dependencies or sensitive environment references. `@jmp/config` preserves shared strict TypeScript presets.
- **Future Tasks Out of Scope:** No authentication, UI state management, RTK Query, Docker compose files, or CI/CD pipelines were added.

---

## 8. Summary of Canonical Developer Commands

| Purpose | Canonical Command |
| :--- | :--- |
| Check all code quality (format, lint, types, tests) | `pnpm check` |
| Check code formatting without edits | `pnpm format:check` |
| Format codebase with Prettier | `pnpm format` |
| Lint all workspace packages | `pnpm lint` |
| Typecheck all workspace packages | `pnpm typecheck` |
| Run all workspace test suites | `pnpm test` |
| Run API in development with watch mode | `pnpm --filter @jmp/api dev` |
| Build API for production | `pnpm --filter @jmp/api build` |
| Run compiled API production bundle | `pnpm --filter @jmp/api start` |
