# JMP-26 Engineering Handoff — Bootstrap Express + TypeScript API

**Task:** JMP-26 — Bootstrap Express and TypeScript API application  
**Workspace Package:** `@jmp/api`  
**Status:** Verification Complete — Ready for Review

---

## 1. Files Created and Updated

### Created in `apps/api/`

- [`apps/api/src/app.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/app.ts) — Express application factory `createApp()` with zero listen/process side effects for safe integration testing.
- [`apps/api/src/server.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/server.ts) — Process entry point: starts HTTP server on port 3000 (configurable via `PORT`), handles startup errors (`EADDRINUSE`), registers graceful idempotent shutdown on `SIGTERM` / `SIGINT` (exit code 0) and `unhandledRejection` / `uncaughtException` (bounded shutdown with exit code 1).
- [`apps/api/src/observability/logger.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/observability/logger.ts) — Singleton Pino structured logger configured with security redactions (`authorization`, `cookie`, `password`, `token`).
- [`apps/api/src/middleware/request-id.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/middleware/request-id.ts) — Validates incoming `X-Request-Id` (strict allowlist `^[\w-]{1,128}$`), generates UUID fallback via `crypto.randomUUID()`, binds to `req.requestId`, and sets `X-Request-Id` response header.
- [`apps/api/src/middleware/not-found.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/middleware/not-found.ts) — RFC 9457 404 Problem Details handler (`ROUTE_NOT_FOUND`) with `application/problem+json`.
- [`apps/api/src/middleware/error-handler.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/middleware/error-handler.ts) — 4-argument central Express error handler mapping operational `AppError`, body-parser JSON syntax errors (`MALFORMED_JSON`, 400), payload limits (`PAYLOAD_TOO_LARGE`, 413), and unknown errors (generic 500 without leaking stack traces or internal messages).
- [`apps/api/src/errors/app-error.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/errors/app-error.ts) — Typed domain/HTTP error class with `statusCode`, stable machine `code`, and safe client `message`.
- [`apps/api/src/types/problem-details.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/types/problem-details.ts) — RFC 9457 problem details TypeScript interface.
- [`apps/api/src/types/express.d.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/types/express.d.ts) — Declaration merging augmenting `Express.Request` with `requestId: string`.
- [`apps/api/src/routes/index.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/routes/index.ts) — Root router with `GET /` service metadata and mounting `/api/v1`.
- [`apps/api/src/routes/v1/index.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/routes/v1/index.ts) — `v1` API router with `GET /api/v1` informational envelope (`{ data: { service, version, status } }`).
- [`apps/api/src/app.test.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/app.test.ts) — Comprehensive Supertest + Vitest suite (11 integration tests).
- [`apps/api/tsconfig.build.json`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/tsconfig.build.json) — Production build configuration emitting JavaScript to `dist/`.
- [`apps/api/vitest.config.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/vitest.config.ts) — Node environment Vitest configuration for API tests.
- [`apps/api/.env.example`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/.env.example) — Minimal bootstrap environment variables template (`PORT`, `CORS_ORIGINS`, `LOG_LEVEL`).
- [`apps/api/README.md`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/README.md) — Documentation covering package scripts, baseline, endpoints, and architectural roadmap.

### Updated

- [`apps/api/package.json`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/package.json) — Added `dev`, `build`, and `start` scripts, Express 5, CORS, Helmet, Pino, and dev tooling.
- [`apps/api/tsconfig.json`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/tsconfig.json) — Included `.d.ts` declaration merging.
- [`apps/api/src/index.ts`](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/index.ts) — Main entry preserving contract version and exporting `createApp`, `AppError`, `logger`.

---

## 2. Installed Dependencies

### Runtime Dependencies

- `express`: `^5.1.0` (installed `5.3.0`)
- `helmet`: `^8.0.0` (installed `8.1.0`)
- `cors`: `^2.8.5` (installed `2.8.5`)
- `pino`: `^9.6.0` (installed `9.6.0`)
- `pino-http`: `^10.4.0` (installed `10.5.0`)
- `@jmp/contracts`: `workspace:*`

### Development Dependencies

- `@types/express`: `^5.0.3` (installed `5.0.6`)
- `@types/cors`: `^2.8.17` (installed `2.8.17`)
- `@types/node`: `^22.13.10` (installed `22.13.10`)
- `@types/supertest`: `^6.0.3` (installed `6.0.3`)
- `supertest`: `^7.1.0` (installed `7.3.2`)
- `tsx`: `^4.19.4` (installed `4.23.15`)
- `@jmp/config`: `workspace:*`

---

## 3. Middleware and Routing Order

1. **Header Hygiene**: `app.disable('x-powered-by')`
2. **Request Correlation**: `requestId` middleware (`X-Request-Id` validation/generation)
3. **Structured Logging**: `pinoHttp` with redacted authorization/cookie headers
4. **Security Headers**: `helmet()`
5. **CORS**: Explicit origin allowlist (defaults to `http://localhost:5173`, configurable via `CORS_ORIGINS`; omits CORS headers for unauthorized origins, permits requests without `Origin` header)
6. **Body Parsing**: `express.json({ limit: '1mb' })`
7. **Routing**: `rootRouter` (`GET /` and `/api/v1` mounting `v1Router` with `GET /api/v1`)
8. **Catch-All 404**: `notFound` returning RFC 9457 `application/problem+json`
9. **Central Error Handler**: `errorHandler` (4-argument signature) mapping JSON parser errors, `AppError`, and safe generic 500s

---

## 4. Architectural Decisions and Baseline Adherence

- **No Port Binding in `app.ts`**: `createApp()` creates the Express app without listening or registering signal handlers, enabling isolated Supertest runs without port conflicts.
- **Strict NodeNext ESM**: Preserved `.js` extension specifiers and `verbatimModuleSyntax`.
- **RFC 9457 Problem Details**: All errors return `application/problem+json` formatted with `type`, `title`, `status`, `detail`, `instance`, `code`, and `requestId`.
- **Graceful Shutdown**: `server.ts` tracks shutdown state to prevent duplicate execution, closes the HTTP listener, enforces a 10s timeout, and terminates with code 0 on signals and code 1 on unhandled exceptions/rejections.

---

## 5. Verification Commands and Results

| Command                                        | Result  | Notes                                                                              |
| ---------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `pnpm --filter @jmp/api lint`                  | ✅ PASS | 0 warnings, 0 errors                                                               |
| `pnpm --filter @jmp/api typecheck`             | ✅ PASS | Strict TypeScript compiler check passed                                            |
| `pnpm --filter @jmp/api test`                  | ✅ PASS | 12 tests passed across 2 test files                                                |
| `pnpm --filter @jmp/api build`                 | ✅ PASS | Output generated in `apps/api/dist/`                                               |
| `pnpm workspace:check`                         | ✅ PASS | 4 packages validated                                                               |
| `pnpm check`                                   | ✅ PASS | Lint, typecheck, and tests passed across entire monorepo                           |
| `curl -i http://localhost:3000/`               | ✅ PASS | HTTP 200 `{"service":"Job Marketplace API","apiBase":"/api/v1"}`                   |
| `curl -i http://localhost:3000/api/v1`         | ✅ PASS | HTTP 200 `{"data":{"service":"Job Marketplace API","version":"v1","status":"ok"}}` |
| `curl -i http://localhost:3000/api/v1/unknown` | ✅ PASS | HTTP 404 `application/problem+json` with `ROUTE_NOT_FOUND` & correlation ID        |

---

## 6. Local Run Commands

- **Development mode (watch):**
  ```bash
  pnpm --filter @jmp/api dev
  ```
- **Production build & run:**
  ```bash
  pnpm --filter @jmp/api build
  pnpm --filter @jmp/api start
  ```
- **Default URLs:**
  - Service metadata: `http://localhost:3000/`
  - Versioned API base: `http://localhost:3000/api/v1`

---

## 7. Deferred Items (Out of Scope for JMP-26)

- Database, Prisma schema, migrations, and PostgreSQL container: **JMP-27 / JMP-31**
- Shared Zod domain/request/response validation contracts in `@jmp/contracts`: **JMP-28**
- Typed environment schema and configuration validation: **JMP-29**
- Health and readiness probes (`/health`, `/health/live`, `/health/ready`): **JMP-31**
- CI/CD workflow: **JMP-32**
- Authentication, authorization, and domain business modules: Later sprints
