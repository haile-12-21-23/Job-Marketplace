# JMP-31 — API Health Checks and Local Docker Development Services

**Jira:** [JMP-31 — Add API health check and local Docker development services](https://hailemariamaddisu21.atlassian.net/browse/JMP-31)  
**Repository:** Job Marketplace monorepo  
**Package:** `@jmp/api`  
**Sprint:** Sprint 1 — Project Foundation

## 1. Objective

Implement operational health and readiness endpoints for the Express API and add a reproducible local PostgreSQL service using Docker Compose with persistent storage. Update the root/API setup documentation so a developer can start the local database, apply the existing Prisma migration, seed roles, and run the API.

Work only in the existing repository. Do not recreate the monorepo or overwrite completed work from JMP-24 through JMP-30.

## 2. Mandatory preflight

Before editing:

1. Run `git status --short --branch`. Preserve all user changes and do not discard, reset, stash, or overwrite unrelated work.
2. Inspect the root `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `compose.yaml`/`docker-compose.yml` if present, and existing README files.
3. Inspect `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/middleware/error-handler.ts`, `apps/api/src/middleware/request-id.ts`, `apps/api/src/infrastructure/database/prisma.ts`, `apps/api/src/config/env.ts`, Prisma config/schema and current tests.
4. Read the current `apps/api/README.md` and root `README.md`.
5. Confirm the actual PostgreSQL and Prisma versions. The handoff for JMP-27 reports Prisma ORM 7.10.1 and a local PostgreSQL 14 database. Do not assume the live repository has not changed since that handoff.
6. Check whether Docker Engine and the Compose plugin are available. If unavailable, still implement and statically validate the configuration, but clearly report that runtime Compose verification could not be executed.

Do not upgrade Prisma or unrelated dependencies as part of this task.

## 3. PostgreSQL image/version decision

Use a supported PostgreSQL 18 image for the new Compose development service. Prefer the pinned official image tag `postgres:18.7-bookworm` at the time of this task, after checking the tag is available. Keep the major/minor image choice explicit rather than using `latest`.

**Do not use PostgreSQL 14 for the new Docker service.** PostgreSQL 14 reached end of life on 2026-11-12. Prisma ORM 7 supports PostgreSQL 18. References:

- PostgreSQL support policy: https://www.postgresql.org/support/versioning/
- PostgreSQL 14 final release / EOL notice: https://www.postgresql.org/about/news/postgresql-187-1712-1616-1520-1425-and-19-rc-2-released/
- Prisma ORM 7 supported databases: https://www.prisma.io/docs/orm/v7/reference/supported-databases
- Official Docker PostgreSQL image documentation: https://hub.docker.com/_/postgres

The current developer machine may still have a PostgreSQL 14 service on port 5432 and an existing `jmp_dev` database. **Do not stop, modify, migrate, delete, or overwrite that existing native database.** The Compose service must use host port `5433` by default to avoid a port conflict, while PostgreSQL remains on port `5432` inside the container.

### PostgreSQL 18 volume path requirement

The official PostgreSQL Docker image changed its data directory layout for PostgreSQL 18+. Mount the named volume at `/var/lib/postgresql`, not the legacy `/var/lib/postgresql/data` path. For PostgreSQL 17 and older, the correct path differs. This task intentionally uses PostgreSQL 18.7.

## 4. Docker Compose service

Create or update a root-level `compose.yaml` (preferred; preserve an existing Compose file if already established) with a database service only. Do not containerize the API in this issue.

Requirements:

- Service name: `postgres` (or preserve an existing agreed service name consistently).
- Image: pinned PostgreSQL 18.7 official image, preferably `postgres:18.7-bookworm`.
- Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` loaded from a dedicated local Compose env file, not committed secrets.
- Host port mapping defaults to `5433:5432`, configurable via `POSTGRES_PORT`.
- Named volume for durable local data, mounted to `/var/lib/postgresql` for PostgreSQL 18+.
- Health check uses `pg_isready` with the configured user and database. Escape Compose-time variable expansion correctly so values are read inside the container (for example, `$${POSTGRES_USER}` and `$${POSTGRES_DB}` in `CMD-SHELL`).
- Reasonable health check interval, timeout, retries and start period.
- Use a restart policy appropriate for a local development database (`unless-stopped` is acceptable).
- No public internet exposure beyond the local host port. Bind to `127.0.0.1` if compatible with the intended local workflow; otherwise document that the port is for local development only.
- Do not set `POSTGRES_HOST_AUTH_METHOD=trust`.
- Do not add a fixed `container_name` unless there is a compelling repository-specific reason; avoid breaking parallel checkouts.

Add a `.env.docker.example` or equivalent dedicated Compose environment template with non-production placeholder values and clear warnings. Add the actual local Compose env filename (for example `.env.docker`) to `.gitignore`. Never commit a real password. Do not rely on `.env.example` being auto-loaded by Compose; use an explicit `--env-file` command in documentation.

Example developer workflow (adapt to the final naming and scripts):

```bash
cp .env.docker.example .env.docker
# Edit .env.docker and replace the local-only placeholder password.
docker compose --env-file .env.docker up -d postgres
docker compose ps
```

Use variables such as:

```dotenv
POSTGRES_USER=jmp_user
POSTGRES_PASSWORD=replace-with-a-local-only-password
POSTGRES_DB=jmp_dev
POSTGRES_PORT=5433
```

Ensure the host API connection URL documented for this service points to `localhost:5433`, for example:

```dotenv
DATABASE_URL=postgresql://jmp_user:replace-with-a-local-only-password@localhost:5433/jmp_dev?schema=public
```

Keep credentials out of tracked files. Explain URL-encoding if a developer uses special characters in a database password.

## 5. API health endpoints

Register a small modular health route module consistent with the current route registration patterns. These are operational endpoints at the root (not nested under `/api/v1`), unless existing documented repository conventions require otherwise.

Implement:

### `GET /health`

A lightweight process/API status response. It must not require a database query. Return HTTP 200 while the process is serving requests.

### `GET /health/live`

Liveness probe. Return HTTP 200 when the event loop and HTTP server are responsive. It must not query PostgreSQL. This endpoint is intended to distinguish a live process from a process that needs restart.

### `GET /health/ready`

Readiness probe. Run a minimal database connectivity check using the existing Prisma/PostgreSQL adapter lifecycle, preferably a bounded `SELECT 1` through the existing database client. Return:

- HTTP 200 when database connectivity check succeeds.
- HTTP 503 when the database check fails or times out.

Use the repository's success envelope convention for successful JSON responses where appropriate. For readiness failure, return the existing RFC 9457 `application/problem+json` shape and include the established `code` and `requestId` fields. Use a stable service-unavailable code such as `SERVICE_NOT_READY` (confirm it does not conflict with existing codes).

**Security and reliability rules:**

- Never return database URLs, hostnames, usernames, passwords, SQL text, stack traces, or driver error messages in public probe responses.
- Do not log secrets. A readiness failure can be logged as a sanitized warning with request ID and a generic reason/category.
- Bound the readiness database call with a timeout consistent with the existing driver pool/query timeouts. Do not allow an unbounded DB probe to hang indefinitely.
- Liveness must remain successful when PostgreSQL is unavailable; readiness must fail in that situation.
- Do not create a new Prisma client/pool for every health request. Reuse the existing lazy singleton and pool lifecycle.
- Avoid returning detailed component topology or internal dependency metadata to unauthenticated callers.

## 6. Testability and isolation

Preserve the existing `createApp()` factory as an application-construction function with no process, listen, environment-loading or database-connect side effects.

Add health tests using the existing Vitest + Supertest setup. Prefer an explicit injectable readiness-check dependency in `AppOptions`, or an equivalent seam that avoids opening a real database during ordinary unit tests. Do not introduce fragile global module mocks if a small typed dependency injection option is cleaner.

At minimum test:

1. `GET /health` returns HTTP 200 and a stable minimal status payload.
2. `GET /health/live` returns HTTP 200 without invoking the database readiness check.
3. `GET /health/ready` returns HTTP 200 when the injected DB check resolves.
4. `GET /health/ready` returns HTTP 503 and RFC 9457 problem details when the check rejects.
5. The 503 response does not contain driver error details, credentials, SQL text or stack traces.
6. The failure response includes `requestId` and the corresponding `X-Request-Id` header.
7. A readiness timeout is handled as 503 if timeout behavior is implemented separately from the driver timeout.
8. Existing root route, `/api/v1`, 404, error handling, CORS and Supertest tests remain passing.

Use deterministic tests. Do not require a running Docker daemon or local PostgreSQL for the unit tests.

## 7. Database check implementation

Inspect the existing Prisma 7 database module before making changes. Reuse its established singleton and connection lifecycle. Prefer exporting a small `checkDatabaseReadiness()` function from the infrastructure module so the route does not import Prisma generated-client internals directly.

The check should execute a minimal query (`SELECT 1`) and resolve only when the DB is reachable. Catch errors at the route/service boundary, convert them to a safe 503 response, and do not transform every arbitrary exception into a successful result.

Do not change the Prisma schema or existing migration. Do not run `migrate reset`, remove volumes or drop the existing `jmp_dev` database.

## 8. Local database setup and migration workflow

Update root `README.md` and `apps/api/README.md` with a complete copy/paste local workflow:

1. Prerequisites: Node/pnpm versions from the repo, Docker Engine, Docker Compose plugin.
2. Copy `.env.docker.example` to the ignored local env file and set a local password.
3. Start PostgreSQL using explicit `docker compose --env-file ... up -d postgres`.
4. Check database container state and health (`docker compose ... ps`; optionally logs).
5. Configure `apps/api/.env` from `apps/api/.env.example` with the matching `DATABASE_URL` at host port 5433.
6. Apply the existing Prisma migration using the established package command (for example `pnpm --filter @jmp/api db:migrate:dev`); do not generate a replacement migration for this infrastructure task.
7. Run the idempotent seed command.
8. Start API in dev mode.
9. Test `/health`, `/health/live`, `/health/ready` and `/api/v1` with curl.
10. Stop the Compose service using `docker compose ... down` (without `-v`) so the named volume remains intact.

Clearly distinguish `docker compose down` (keeps named volume) from `docker compose down -v` (deletes the database volume). Warn prominently that `down -v` is destructive and should not be part of normal cleanup instructions. Do not recommend `migrate reset` as routine setup.

Document how to inspect logs/status and how to restart the database without deleting persisted data.

## 9. Package scripts

Add root or API convenience scripts only if they improve discoverability and follow existing naming conventions, e.g. `db:up`, `db:down`, `db:logs`, `db:status`. If scripts are added, make them consistently use the explicit Compose env file and service name. Preserve simple direct Docker Compose commands in the README as the canonical source of truth.

Do not add a containerized API service, reverse proxy, Redis, mail service, or unrelated development dependencies in JMP-31.

## 10. Scope boundaries

In scope:

- `/health`, `/health/live`, `/health/ready` endpoints.
- A reusable DB readiness check using the existing Prisma client.
- Safe 503 response for not-ready state.
- Docker Compose PostgreSQL service and named persistent volume.
- Dedicated ignored local env file and safe example template.
- Complete local setup and teardown instructions.
- Unit/integration-style route tests using dependency injection.

Out of scope:

- Authentication, authorization, rate limiting and admin endpoints.
- Kubernetes manifests, Helm charts, cloud deployment or production Compose.
- Containerizing the API application.
- CI workflow (JMP-32).
- Changes to Prisma models/schema/migrations or business logic.
- Upgrading application dependencies without a demonstrated blocker.

## 11. Required verification

Run and report exact results for:

### Static/quality checks

```bash
pnpm workspace:check
pnpm check
pnpm --filter @jmp/api build
```

Ensure root format, lint, strict typecheck and all package tests pass.

### Docker Compose checks

```bash
docker compose --env-file .env.docker config
# Start and inspect the database:
docker compose --env-file .env.docker up -d postgres
docker compose --env-file .env.docker ps
# Confirm container health and PostgreSQL version:
docker compose --env-file .env.docker exec postgres pg_isready -U jmp_user -d jmp_dev
docker compose --env-file .env.docker exec postgres psql -U jmp_user -d jmp_dev -c 'SHOW server_version;'
```

Use the actual configured service/user/database names. Confirm the server major version is 18.

### Persistence check

- Apply the existing migration and seed to the new Compose database.
- Record a harmless verification (migration status or a known seeded role count).
- Restart the `postgres` service without removing its volume.
- Confirm the migration status and seed data persist.
- Do not use `docker compose down -v` in any verification step.

### API runtime checks

Start API with the `.env` configured to use host port 5433. Verify:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/health/live
curl -i http://localhost:3000/health/ready
curl -i http://localhost:3000/api/v1
```

Also demonstrate readiness failure safely by temporarily making the DB unavailable or using the injected failing check in tests. Confirm liveness remains 200 and readiness becomes 503. Restore the database afterwards.

If Docker is unavailable, do not claim container runtime or persistence checks passed. Complete the code, Compose static validation if tooling is available, tests and docs, then clearly note the runtime limitation.

## 12. Completion handoff

At the end, provide:

- Files created/modified and their purpose.
- Exact endpoint semantics and example HTTP status/results.
- Final Compose service/image, host port and volume mount path.
- How the `.env.docker` and API `DATABASE_URL` relate.
- Exact output/results for all quality, migration, seed, persistence and runtime checks.
- Confirmation no native local PostgreSQL service/data or existing database was modified.
- Confirmation no secrets, env files, volumes or generated build artifacts were accidentally committed.
- Any checks not run and why.

Do not claim JMP-31 is complete unless every Jira acceptance criterion is verified. Preserve unrelated user changes and do not make commits unless explicitly requested.
