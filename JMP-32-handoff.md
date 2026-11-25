# JMP-32 Implementation Handoff — GitHub Actions CI Workflow

**Jira Issue:** [JMP-32 — Configure GitHub Actions CI for lint, typecheck, tests and builds](https://hailemariamaddisu21.atlassian.net/browse/JMP-32)  
**Pull Request:** [#13 (JMP-32: Configure GitHub Actions CI for lint, typecheck, tests and builds)](https://github.com/haile-12-21-23/Job-Marketplace/pull/13)  
**Hosted CI Run:** [Run #45563714950](https://github.com/haile-12-21-23/Job-Marketplace/actions/runs/45563714950)  
**Date:** 2026-11-25  
**Status:** COMPLETE & VERIFIED HOSTED RUN

---

## 1. Executive Summary & Preflight Findings

A thorough preflight inspection was completed prior to implementation:

- **Monorepo Baseline & Toolchain:**
  - Pinned runtime: Node.js `24.22.3` (satisfies root `package.json` engines requirement `>=24.22.0`).
  - Pinned package manager: pnpm `12.17.0` (as declared in root `packageManager`).
  - Primary default branch: `master`.
- **Existing Work Preserved:** Preserved completed work from JMP-24 through JMP-31 (Express 5 API, React 19 web app, shared Zod contracts `@jmp/contracts`, shared TypeScript configuration `@jmp/config`, Prisma 7 ORM, Docker Compose 18.7 service, and health check endpoints).
- **Security & Least-Privilege:** Workflow uses `permissions: contents: read`. No repository secrets, deployment keys, or production endpoints are exposed or required.
- **Database Architecture:** Configured an ephemeral PostgreSQL 18.7 service container (`postgres:18.7-bookworm`) with disposable test credentials (`jmp_ci` / `jmp_ci_password`). All database migrations are deployed cleanly before tests execute.

---

## 2. GitHub Actions Workflow Architecture

### 2.1 File Location & Trigger Specifications

- **Workflow File:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- **Triggers:**
  - `pull_request` targeting `master`
  - `push` to `master`
  - `workflow_dispatch` (manual dispatch)
- **Concurrency:** Derive group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` to prevent resource waste while isolating unrelated pull requests.

### 2.2 Action Pinning Strategy

Actions are pinned to verified full commit SHAs with release tag comments for supply-chain security:

| Action               | Tag      | Verified Commit SHA                        |
| :------------------- | :------- | :----------------------------------------- |
| `actions/checkout`   | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `pnpm/action-setup`  | `v6.1.1` | `73e46992e05b19abd31f2f3c20e0e7370d762115` |
| `actions/setup-node` | `v7.1.0` | `949feb2413d6458794dcd2491c4babbbce0c15c1` |

### 2.3 Ephemeral PostgreSQL 18.7 Service Container

```yaml
services:
  postgres:
    image: postgres:18.7-bookworm
    env:
      POSTGRES_USER: jmp_ci
      POSTGRES_PASSWORD: jmp_ci_password
      POSTGRES_DB: jmp_ci
    ports:
      - 5432:5432
    options: >-
      --health-cmd "pg_isready -U jmp_ci -d jmp_ci"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
      --health-start-period 10s
```

- **Environment Variable:** `DATABASE_URL=postgresql://jmp_ci:jmp_ci_password@localhost:5432/jmp_ci?schema=public`
- **Readiness Step:** Bounded loop polling `pg_isready` (with fallback socket check) guarantees zero race conditions before running migrations.
- **Migration & Client Generation:** Production-safe `prisma migrate deploy` executes against the ephemeral service, followed by explicit Prisma Client generation.

---

## 3. Workflow Steps & Execution Order

| Step # | Step Name                               | Command Executed                           | Purpose                                                                      |
| :----: | :-------------------------------------- | :----------------------------------------- | :--------------------------------------------------------------------------- |
|   1    | Checkout repository                     | `actions/checkout@3d3c42e5...`             | Shallow fetch triggering commit                                              |
|   2    | Install pnpm                            | `pnpm/action-setup@73e4699...`             | Install pnpm `12.17.0`                                                       |
|   3    | Set up Node.js                          | `actions/setup-node@949feb2...`            | Install Node `24.22.3` and configure pnpm store caching                      |
|   4    | Print toolchain diagnostics             | `node -v`, `pnpm -v`, `pnpm store path`    | Environment debugging                                                        |
|   5    | Install dependencies                    | `pnpm install --frozen-lockfile`           | Deterministic reproducible dependencies install                              |
|   6    | Validate workspace structure            | `pnpm run workspace:check`                 | Validate package graph and internal references                               |
|   7    | Verify PostgreSQL service readiness     | `pg_isready` bounded poll                  | Ensure database container is ready for queries                               |
|   8    | Apply database migrations               | `pnpm --filter @jmp/api db:migrate:deploy` | Apply migrations to ephemeral database                                       |
|   9    | Generate Prisma client                  | `pnpm --filter @jmp/api db:generate`       | Generate typed client for typecheck & tests                                  |
|   10   | Check code formatting                   | `pnpm run format:check`                    | Prettier compliance across all workspaces                                    |
|   11   | Run linter                              | `pnpm run lint`                            | ESLint across all workspaces (`--max-warnings=0`)                            |
|   12   | Run typecheck                           | `pnpm run typecheck`                       | TypeScript compiler type validation (`tsc --noEmit`)                         |
|   13   | Run test suites                         | `pnpm run test`                            | Vitest suites across `@jmp/config`, `@jmp/contracts`, `@jmp/api`, `@jmp/web` |
|   14   | Build `@jmp/contracts` package          | `pnpm --filter @jmp/contracts run build`   | Compile contracts to `dist/index.js`                                         |
|   15   | Build `@jmp/api` package                | `pnpm --filter @jmp/api run build`         | Compile API server to `dist/server.js`                                       |
|   16   | Build `@jmp/web` package                | `pnpm --filter @jmp/web run build`         | Compile Vite bundle to `apps/web/dist`                                       |
|   17   | Verify compiled API artifact resolution | Node inline module test                    | Verify production API resolves compiled `@jmp/contracts/dist/index.js`       |

---

## 4. Verification Evidence & Hosted Run Results

### 4.1 Hosted GitHub Actions Run

- **Run URL:** [https://github.com/haile-12-21-23/Job-Marketplace/actions/runs/45563714950](https://github.com/haile-12-21-23/Job-Marketplace/actions/runs/45563714950)
- **Status:** `completed`
- **Conclusion:** `success` (All steps succeeded with exit code 0)
- **Job Name:** `Build and Test` (`build-and-test`)

### 4.2 Local Reproduction Commands

```bash
# 1. Monorepo install with frozen lockfile
$ pnpm install --frozen-lockfile
Done in 2.4s using pnpm v12.17.0

# 2. Workspace validation
$ pnpm workspace:check
Workspace structure OK (4 packages; all workspace:* references resolve).

# 3. Formatting, Linting, Typechecking, and Tests
$ pnpm check
All matched files use Prettier code style!
packages/config lint$ eslint src --max-warnings=0 (Done in 576ms)
packages/contracts lint$ eslint src --max-warnings=0 (Done in 370ms)
apps/web lint$ eslint src --max-warnings=0 (Done in 479ms)
apps/api lint$ eslint src --max-warnings=0 (Done in 464ms)
packages/config typecheck$ tsc --noEmit -p tsconfig.json (Done in 230ms)
packages/contracts typecheck$ tsc --noEmit -p tsconfig.json (Done in 425ms)
apps/web typecheck$ tsc --noEmit -p tsconfig.json (Done in 1.2s)
apps/api typecheck$ tsc --noEmit -p tsconfig.json (Done in 1.6s)
packages/config:  1 test passed
packages/contracts: 38 tests passed
apps/api:        44 tests passed
apps/web:        27 tests passed
Total: 110 passed (0 failed).

# 4. Production Builds
$ pnpm --filter @jmp/contracts run build
$ pnpm --filter @jmp/api run build
$ pnpm --filter @jmp/web run build
dist/index.html                   0.49 kB
dist/assets/index-BWekSYQE.css   21.45 kB
dist/assets/index-nBI_316M.js   414.38 kB
built in 129ms
```

---

## 5. Repository Protection & Manual Follow-up

1. **Stable GitHub Check Name:** `build-and-test`
2. **Branch Protection Setup Required in GitHub:**
   - Go to: **Settings** → **Rules** / **Rulesets** (or **Branches**).
   - Target branch: `master`.
   - Enable: **Require status checks to pass before merging**.
   - Add status check: `build-and-test`.
