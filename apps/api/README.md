# @jmp/api — Job Marketplace Express API

Backend Express application for the Job Marketplace (JMP) platform.

## Requirements

- Node.js `>=24.22.0` (pinned by the monorepo root via `.nvmrc` and `packageManager`).
- pnpm `>=12.17.0` (pinned by root `packageManager`).
- PostgreSQL `>=14` running locally or accessible via network.

## Database Setup

### 1. Create Local Development & Shadow Databases

Connect to your local PostgreSQL instance (e.g. using `psql`) and create a clean database for development and optionally a shadow database for Prisma migration diffing:

```bash
psql -h localhost -U postgres -c "CREATE DATABASE jmp_dev;"
psql -h localhost -U postgres -c "CREATE DATABASE jmp_shadow;"
```

> **Note on Shadow Database:** Prisma Migrate needs a shadow database to detect schema drift when creating migrations. In standard setups where the database user has `CREATEDB` permissions, Prisma creates and drops temporary shadow databases automatically. If your user lacks `CREATEDB` rights, specify `SHADOW_DATABASE_URL` pointing to `jmp_shadow`.

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` with your database credentials:

```env
PORT=3000
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/jmp_dev?schema=public
SHADOW_DATABASE_URL=postgresql://<user>:<password>@localhost:5432/jmp_shadow?schema=public
```

> [!WARNING]
> `.env` is ignored by Git. Never commit real credentials, passwords, or connection strings to version control.

### 3. Generate Prisma Client and Run Migrations

```bash
# Generate the Prisma Client
pnpm --filter @jmp/api db:generate

# Apply pending migrations to the development database
pnpm --filter @jmp/api db:migrate:dev

# Check migration status
pnpm --filter @jmp/api db:migrate:status

# Seed initial platform reference data
pnpm --filter @jmp/api db:seed
```

## Migration Workflow

### Development vs. Production Migrations

- **`db:migrate:dev` (`prisma migrate dev`)**: Used exclusively in local development. It detects schema changes in `prisma/schema.prisma`, generates SQL migration files, checks against the shadow database, applies new migrations to your local development database, and generates the Prisma Client.
- **`db:migrate:deploy` (`prisma migrate deploy`)**: Used in CI/CD, staging, and production environments. It applies existing, committed migration files without generating new migrations or using a shadow database.

### Reviewing and Committing Migrations

All migrations live in `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`.
- Migration files are immutable once applied and committed.
- Always review generated SQL before committing.
- Any custom database constraints, triggers, or partial indexes must be committed directly within migration SQL files.

> [!CAUTION]
> **Do NOT use `prisma migrate reset` lightly!**
> `migrate reset` drops the entire database, deletes all data, and reruns all migrations from scratch. It must NEVER be executed against shared, staging, or production databases. There is no automated shortcut script for reset in this repository to prevent accidental data loss.

## Available Scripts

From the repository root:

| Command | Description |
|---|---|
| `pnpm --filter @jmp/api dev` | Start development server with file watching via `tsx` |
| `pnpm --filter @jmp/api build` | Generate Prisma client and compile TypeScript to `dist/` |
| `pnpm --filter @jmp/api start` | Run compiled production bundle with `node dist/server.js` |
| `pnpm --filter @jmp/api lint` | Lint API source files with ESLint |
| `pnpm --filter @jmp/api typecheck` | Run strict TypeScript compiler verification without emitting |
| `pnpm --filter @jmp/api test` | Run unit and integration tests with Vitest |
| `pnpm --filter @jmp/api db:format` | Format `prisma/schema.prisma` |
| `pnpm --filter @jmp/api db:validate` | Validate `prisma/schema.prisma` syntax and references |
| `pnpm --filter @jmp/api db:generate` | Generate Prisma 7 Client to `src/generated/prisma` |
| `pnpm --filter @jmp/api db:migrate:dev` | Apply migrations to development database |
| `pnpm --filter @jmp/api db:migrate:deploy` | Apply migrations in staging/production |
| `pnpm --filter @jmp/api db:migrate:status` | Check status of database migrations |
| `pnpm --filter @jmp/api db:seed` | Seed deterministic reference data (platform roles) |
| `pnpm --filter @jmp/api db:studio` | Open interactive Prisma Studio GUI |
| `pnpm check` | Run workspace-wide lint, typecheck, and test checks |

## Endpoints

- Base URL: `http://localhost:3000`
- Service metadata: `GET /`
- Versioned API base: `GET /api/v1`

## Architecture & Lifecycle

- **`createApp()` in `src/app.ts`**: Pure Express application factory free of database connection, listener, or process signal side-effects. Enables pure unit testing without a running PostgreSQL instance.
- **`src/server.ts`**: Dedicated process entry point. Connects to PostgreSQL via `connectDatabase()` before starting the HTTP listener. Integrates bounded graceful shutdown and database disconnect.
- **`src/config/database-config.ts`**: Validates `DATABASE_URL` format and fast-fails safely without exposing sensitive connection credentials in logs.
- **`src/infrastructure/database/prisma.ts`**: Manages the singleton Prisma 7 client with `PrismaPg` adapter and bounded connection pool settings.
