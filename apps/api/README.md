# @jmp/api — Job Marketplace Express API

Backend Express application for the Job Marketplace (JMP) platform.

## Requirements

- Node.js `>=24.22.0` (pinned by the monorepo root via `.nvmrc` and `packageManager`).
- pnpm `>=12.17.0` (pinned by root `packageManager`).

## First-time setup

From the repository root:

```bash
pnpm install
```

## Available scripts

From the repository root:

| Command | Description |
|---|---|
| `pnpm --filter @jmp/api dev` | Start development server with file watching via `tsx` |
| `pnpm --filter @jmp/api build` | Compile TypeScript to `dist/` |
| `pnpm --filter @jmp/api start` | Run compiled production bundle with `node dist/server.js` |
| `pnpm --filter @jmp/api lint` | Lint API source files with ESLint |
| `pnpm --filter @jmp/api typecheck` | Run strict TypeScript compiler verification without emitting |
| `pnpm --filter @jmp/api test` | Run API integration tests with Vitest |
| `pnpm check` | Run workspace-wide lint, typecheck, and test checks |

## Endpoints

- Base URL: `http://localhost:3000`
- Service metadata: `GET /`
- Versioned API base: `GET /api/v1`

## Scope and Roadmap

This package currently bootstraps the Express API foundation (JMP-26).
- Database connections, Prisma schemas, and migrations are handled in **JMP-27 / JMP-31**.
- Shared Zod validation contracts are added in **JMP-28**.
- Typed environment configuration is added in **JMP-29**.
- Health and readiness probes (`/health`, `/health/live`, `/health/ready`) are added in **JMP-31**.
