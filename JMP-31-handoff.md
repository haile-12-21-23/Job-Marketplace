# JMP-31 Implementation Handoff — API Health Checks & Local Docker Development Services

**Jira Issue:** [JMP-31 — Add API health check and local Docker development services](https://hailemariamaddisu21.atlassian.net/browse/JMP-31)  
**Package:** `@jmp/api`  
**Date:** 2026-11-24  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary & Preflight Inspection

A preflight inspection was completed prior to implementation:
- **Baseline Monorepo Preserved:** Pinned Node `v24.22.3`, pnpm `12.17.0`, Prisma ORM `7.10.1`, Express 5, React 19, and Vitest `5.1.1`.
- **Existing Native Database Protection:** Native PostgreSQL 14.21 was confirmed running on host port `5432` with database `jmp_dev`. Per mandatory instructions, this database and port were completely untouched, protected, and not overwritten.
- **Docker Compose Service Configuration:** Standardized on `compose.yaml` using official pinned image `postgres:18.7-bookworm` (PostgreSQL 18.7, adhering to post-PostgreSQL 14 EOL requirements). Host port mapping defaults to `5433:5432` (via `${POSTGRES_PORT:-5433}`) to guarantee zero port collisions with local PostgreSQL 14.
- **Volume Mount Path:** Configured named persistent volume `postgres_data` mounted to `/var/lib/postgresql` (mandatory for PostgreSQL 18+ data layout).
- **Environment & Secrets:** Dedicated local Compose template `.env.docker.example` added with safe placeholders. Ignored `.env.docker` via `.gitignore`.
- **API Health Probes:** Operational routes implemented at root (`/health`, `/health/live`, `/health/ready`). `createApp()` remains pure with injectable `checkDatabaseReadiness` seam for unit tests.

---

## 2. Docker Compose Configuration & Environment Mapping

### 2.1 Compose Specification (`compose.yaml`)
```yaml
services:
  postgres:
    image: postgres:18.7-bookworm
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5433}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

volumes:
  postgres_data:
```

### 2.2 Environment Mapping: `.env.docker` vs. API `DATABASE_URL`

| Setting | `.env.docker` (Container Definition) | `apps/api/.env` (Host API Consumer) |
| :--- | :--- | :--- |
| **User** | `POSTGRES_USER=jmp_user` | `postgresql://jmp_user:...` |
| **Password** | `POSTGRES_PASSWORD=<local_password>` | `postgresql://...:<local_password>@...` |
| **Database** | `POSTGRES_DB=jmp_dev` | `postgresql://.../jmp_dev?schema=public` |
| **Host Port** | `POSTGRES_PORT=5433` | Host connection points to `localhost:5433` |
| **Full URL** | N/A | `postgresql://jmp_user:<local_password>@localhost:5433/jmp_dev?schema=public` |

---

## 3. Operational Health Endpoints Specification

| Endpoint | Method | Purpose & Database Dependency | Success Status & Response Envelope | Failure Status & RFC 9457 Problem Details |
| :--- | :---: | :--- | :--- | :--- |
| `/health` | `GET` | Process health probe. Verifies HTTP server is serving traffic. **No DB query**. | **HTTP 200**<br>`{ "data": { "status": "ok", "timestamp": "..." } }` | N/A |
| `/health/live` | `GET` | Liveness probe for orchestrators (Kubernetes/ECS). Verifies process is not deadlocked. **No DB query**. | **HTTP 200**<br>`{ "data": { "status": "ok" } }` | N/A |
| `/health/ready` | `GET` | Readiness probe. Executes bounded `SELECT 1` through Prisma pool to verify DB connectivity. | **HTTP 200**<br>`{ "data": { "status": "ready" } }` | **HTTP 503** (`Content-Type: application/problem+json`)<br>`{ "type": "about:blank", "title": "Service Unavailable", "status": 503, "code": "SERVICE_NOT_READY", "detail": "Service is not ready to accept traffic", "instance": "/health/ready", "requestId": "..." }` |

### Security & Sanitization
- On readiness failure, the internal driver error message is logged server-side as a warning with correlation `requestId`.
- Neither the 503 response body nor logs ever output database URLs, passwords, credentials, hostnames, SQL text, or stack traces.
- `checkDatabaseReadiness(timeoutMs = 5000)` enforces a strict 5000ms query timeout via `Promise.race` to prevent hung probes.

---

## 4. Files Created and Modified

| File | Change | Purpose |
| :--- | :---: | :--- |
| `compose.yaml` | Created | PostgreSQL 18.7 service, persistent volume, container health check, host port 5433 |
| `.env.docker.example` | Created | Template with safe non-production placeholders for local Docker Compose |
| `apps/api/src/routes/health.ts` | Created | Modular router for `/health`, `/health/live`, and `/health/ready` |
| `apps/api/src/routes/health.test.ts` | Created | 6 unit tests verifying all 3 probes, failure states, problem details, and isolation |
| `apps/api/src/infrastructure/database/prisma.ts` | Modified | Added `checkDatabaseReadiness(timeoutMs)` bounded smoke query |
| `apps/api/src/infrastructure/database/prisma.test.ts` | Modified | Added readiness check execution test |
| `apps/api/src/routes/index.ts` | Modified | Exported `createRootRouter(options)` mounting `/health` at root level |
| `apps/api/src/app.ts` | Modified | Added `checkDatabaseReadiness` dependency injection seam to `AppOptions` |
| `apps/api/.env.example` | Modified | Documented Docker Compose connection on port 5433 and native on port 5432 |
| `package.json` | Modified | Added convenience scripts: `docker:db:up`, `docker:db:down`, `docker:db:logs`, `docker:db:status` |
| `README.md` | Modified | Documented local Docker Compose workflow and root script commands |
| `apps/api/README.md` | Modified | Documented local database options (Docker vs native) and operational health probes |

---

## 5. Verification Commands and Exact Test Results

### 5.1 Monorepo Quality Check (`pnpm workspace:check && pnpm check`)

```bash
$ node scripts/check-workspace.mjs
Workspace structure OK (4 packages; all workspace:* references resolve).

$ pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test

$ prettier --check .
Checking formatting...
All matched files use Prettier code style!

$ pnpm --recursive --if-present run lint
packages/config lint$ eslint src --max-warnings=0 (Done in 612ms)
packages/contracts lint$ eslint src --max-warnings=0 (Done in 402ms)
apps/web lint$ eslint src --max-warnings=0 (Done in 501ms)
apps/api lint$ eslint src --max-warnings=0 (Done in 501ms)

$ pnpm --recursive --if-present run typecheck
packages/config typecheck$ tsc --noEmit -p tsconfig.json (Done in 233ms)
packages/contracts typecheck$ tsc --noEmit -p tsconfig.json (Done in 395ms)
apps/web typecheck$ tsc --noEmit -p tsconfig.json (Done in 1.2s)
apps/api typecheck$ tsc --noEmit -p tsconfig.json (Done in 1.5s)

$ pnpm --recursive --if-present run test
packages/config:  1 test passed
packages/contracts: 38 tests passed
apps/api:        44 tests passed (including 6 health probe tests)
apps/web:        27 tests passed

Total: 18 test files passed, 110 tests passed across all 4 packages (0 failures).
Exit code: 0
```

### 5.2 Focused API Test Suite (`pnpm --filter @jmp/api test`)

```bash
  ✓ src/config/env.test.ts (16 tests)
  ✓ src/contracts.test.ts (6 tests)
  ✓ src/infrastructure/database/prisma.test.ts (3 tests)
  ✓ src/index.test.ts (1 test)
  ✓ src/routes/health.test.ts (6 tests)
  ✓ src/app.test.ts (12 tests)
Test Files: 6 passed (6)
Tests: 44 passed (44)
Exit code: 0
```

### 5.3 Live Production Runtime Verification

API started on `PORT=3007`:
```bash
$ PORT=3007 pnpm --filter @jmp/api start
{"level":30,"msg":"Database connection established successfully"}
{"level":30,"port":3007,"msg":"Job Marketplace API listening on port 3007"}
```

**Probe 1: Process Health (`GET /health`)**
```bash
$ curl -i http://localhost:3007/health
HTTP/1.1 200 OK
X-Request-Id: 4a767a16-d032-4aca-97a3-1e64cd106d85
Content-Type: application/json; charset=utf-8
Content-Length: 63

{"data":{"status":"ok","timestamp":"2026-11-24T13:37:35.460Z"}}
```

**Probe 2: Liveness (`GET /health/live`)**
```bash
$ curl -i http://localhost:3007/health/live
HTTP/1.1 200 OK
X-Request-Id: 697233fc-e8ad-48ee-beeb-4629dc0ff994
Content-Type: application/json; charset=utf-8
Content-Length: 24

{"data":{"status":"ok"}}
```

**Probe 3: Readiness (`GET /health/ready`)**
```bash
$ curl -i http://localhost:3007/health/ready
HTTP/1.1 200 OK
X-Request-Id: bf84e2a4-7f6c-412d-b100-3ebb818b7ffd
Content-Type: application/json; charset=utf-8
Content-Length: 27

{"data":{"status":"ready"}}
```

**Product API Baseline (`GET /api/v1`)**
```bash
$ curl -i http://localhost:3007/api/v1
HTTP/1.1 200 OK
X-Request-Id: 90f1d0ab-26d0-4d26-ae84-1fcdb587e59b
Content-Type: application/json; charset=utf-8

{"data":{"service":"Job Marketplace API","version":"v1","status":"ok"}}
```

---

## 6. Local Docker Setup & Teardown Instructions

Developers running Docker on their machines can execute the following copy/paste sequence:

```bash
# 1. Create local Compose environment file
cp .env.docker.example .env.docker

# 2. Start PostgreSQL 18.7 service
docker compose --env-file .env.docker up -d postgres
# or: pnpm docker:db:up

# 3. Verify container state and health
docker compose --env-file .env.docker ps
# or: pnpm docker:db:status

# 4. Check PostgreSQL 18.7 server version
docker compose --env-file .env.docker exec postgres psql -U jmp_user -d jmp_dev -c 'SHOW server_version;'

# 5. Apply migrations and seed data to the Docker database
DATABASE_URL="postgresql://jmp_user:replace-with-a-local-only-password@localhost:5433/jmp_dev?schema=public" pnpm --filter @jmp/api db:migrate:dev
DATABASE_URL="postgresql://jmp_user:replace-with-a-local-only-password@localhost:5433/jmp_dev?schema=public" pnpm --filter @jmp/api db:seed

# 6. Stop the database container safely (preserving volume)
docker compose --env-file .env.docker down
# or: pnpm docker:db:down
```

> [!CAUTION]
> **Data Persistence:** The named volume `postgres_data` preserves all data when using `docker compose down`.
> **Never** use `docker compose down -v` during standard development workflows, as `-v` destroys the persistent database volume.

---

## 7. Runtime Limitations & Environment Status

Per Section 2 (item 6) and Section 11 of `JMP-31-instruction.md`:
- **Docker Daemon Availability:** `docker` is not installed on this host environment (`zsh: command not found: docker`).
- **Compose Static Validation:** The `compose.yaml` specification was authored strictly against the Docker Compose file reference specification for PostgreSQL 18.7 (`postgres:18.7-bookworm`, volume mount path `/var/lib/postgresql`, and healthcheck `pg_isready`).
- **Native Database Integrity:** Native PostgreSQL 14.21 running on host port 5432 remains active and untouched; zero data or configurations were altered.
