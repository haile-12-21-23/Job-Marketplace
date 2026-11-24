# Antigravity Implementation Brief — JMP-27

**Task:** Configure PostgreSQL, Prisma schema and migration workflow  
**Jira:** [JMP-27](https://hailemariamaddisu21.atlassian.net/browse/JMP-27)  
**Project:** Job Marketplace & Recruitment Platform (JMP)  
**Workspace:** pnpm TypeScript monorepo; API package `@jmp/api`

## 1. Mission and acceptance criteria

Implement the PostgreSQL and Prisma foundation in the existing repository. The task is complete only when:

1. The API can connect to PostgreSQL using a required, validated `DATABASE_URL` without exposing credentials in logs.
2. The Prisma schema validates and Prisma Client is generated successfully.
3. A complete initial migration for the approved JMP logical data model can be applied to a **new, empty local development database**.
4. A deterministic, idempotent seed workflow is configured and documented.
5. Database setup, migration, status, generation and seed commands are documented in the API README.
6. The existing API development/build/test workflow remains green and database connection lifecycle is integrated without breaking the pure `createApp()` test boundary.

Do not mark the Jira task complete if the local PostgreSQL server is unavailable or if the migration has not actually been applied to a clean database. Report that blocker and the exact missing prerequisite instead.

## 2. Required repository and documentation inspection

Before editing anything:

1. Run `git status --short`, inspect the current branch, and record any existing user changes. **Do not discard, reset, overwrite or reformat unrelated work.**
2. Inspect the root `package.json`, `pnpm-workspace.yaml`, lockfile, workspace scripts, `apps/api/package.json`, API tsconfigs, source layout and current server lifecycle implementation from JMP-26.
3. Inspect the existing `packages/config` conventions and lint, test and build configuration. Reuse the existing conventions instead of introducing parallel tooling.
4. Read the following approved project documents if present in the repository:
   - `JMP_SRS_v1.0` — especially sections 3, 5, 8 and Appendix B.
   - `JMP_ERD_v1.0` — all three ERD views, including attributes and cardinalities.
   - `JMP_Architecture_Design_v1.0` — API/database boundary and modular-monolith guidance.
   - `JMP_API_Standards_v1.0` — API runtime and environment integration conventions.
5. If documents are absent, look for them under `docs/` and report the missing paths. Do not invent a different data model to compensate. Ask the developer to place the approved documents in the repository if the model cannot be verified.

Treat the SRS and ERD as the product/data-model source of truth. The ERD is a logical model; physical Prisma mappings, concrete types, indexes and database constraints are finalized in this task, while remaining faithful to the documented entities and rules.

## 3. Technology and compatibility decisions

- Use **PostgreSQL** as the system of record.
- Use the currently supported **stable Prisma ORM 7.x** line. Do not install Prisma ORM 8 release-candidate, preview or canary packages for this foundation task.
- Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on compatible, matching Prisma 7 versions. Use the `pg` Node driver as the PostgreSQL adapter driver.
- Use Prisma 7's ESM-first `prisma-client` generator with an explicit generated output path. Do not copy Prisma 6 setup instructions that import the generated client from `@prisma/client` by default.
- Prisma 7 connection URLs are configured in the Prisma config file, not in the `datasource` block of `schema.prisma`. Load `.env` explicitly for Prisma CLI execution.
- Prefer `prisma7.config.ts` for the Prisma 7 CLI config name so that the project does not collide with the Prisma 8 config format. Confirm the installed Prisma 7 CLI discovers it.
- Pin versions through the existing pnpm workspace policy and commit the updated lockfile. Do not upgrade Node, pnpm, TypeScript or existing workspace tooling as a side effect.
- Do not use `prisma db push` as the schema-change workflow. Use committed Prisma Migrate SQL migrations.

Official Prisma references for this implementation:

- PostgreSQL setup and Prisma 7 driver adapter: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql
- Prisma config: https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference
- Prisma Client generation: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client
- Development/production migration workflow: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production
- Seeding: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding

## 4. Expected file layout

Adapt to the repository's established conventions, but aim for a clear API-owned database boundary similar to:

```text
apps/api/
  prisma/
    schema.prisma
    migrations/
      <timestamp>_init/migration.sql
    seed.ts
  prisma7.config.ts
  src/
    config/
      database-config.ts        # DB-specific required-value/URL validation only
    infrastructure/
      database/
        prisma.ts               # Prisma adapter/client construction and singleton
        index.ts                # small public database exports, if useful
    ...existing API files...
  .env.example
  README.md
```

Generated Prisma Client code must live in a deliberate generated directory (prefer `apps/api/src/generated/prisma` if compatible with the current build), must not be hand-edited, and must be reproducibly generated by a documented script. Add generated output to `.gitignore` only if the existing build/install strategy does not require generated code to be committed; explain that choice in the README. Do not commit secrets or a real `.env` file.

## 5. Prisma 7 configuration

Create a Prisma 7 config file with these characteristics (adjust imports only when required by the installed stable Prisma 7 release):

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

If the repository uses a separate shadow database, configure `shadowDatabaseUrl` from an optional `SHADOW_DATABASE_URL` without making it mandatory for normal API runtime. Explain when a dedicated shadow database is needed. Never reuse a production or shared database as the shadow database.

The schema generator should use the Prisma 7 generator and explicit output, for example:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Confirm the generated import path and file extensions work in both the existing `tsx watch` development command and the compiled NodeNext production build. Do not blindly add TypeScript import extensions that break `tsc` emit. If an option such as `importFileExtension` is needed for `tsx`, verify it with both dev and production commands.

## 6. PostgreSQL environment and API connection

- Add an `apps/api/.env.example` with placeholders only. Document at minimum `DATABASE_URL`; document `SHADOW_DATABASE_URL` only if the selected local migration setup uses it.
- Example shape: `postgresql://<user>:<password>@localhost:5432/jmp_dev?schema=public`. Never put a real password in a committed example.
- Validate that `DATABASE_URL` exists, parses as a PostgreSQL URL (`postgresql:` or `postgres:`), and has a host/database path before creating the adapter. Fail fast with a concise, actionable error that never prints the URL or password.
- This is a **database-specific guard only**. Do not implement a second general environment-validation framework; full shared environment validation belongs to JMP-29. Keep this guard small and easy to replace with the centralized environment config in JMP-29.
- Use Prisma 7's PostgreSQL adapter (`PrismaPg`) with `PrismaClient`. Configure bounded connection behavior appropriate for a single API process (including a non-zero connection timeout); do not leave a driver configuration that can hang indefinitely on connection acquisition.
- Export one reusable Prisma client instance for the API process. Avoid creating a new client for each request or importing the client from the frontend/shared packages.
- Do not log connection strings, passwords, token data or private object-storage keys.

### API lifecycle integration

JMP-26 established a pure `createApp()` factory and a separate `server.ts` process entry point. Preserve that separation:

- `createApp()` must remain free of database connection, listener and process signal side effects. Unit tests must still construct the Express app without a running PostgreSQL server.
- Connect to PostgreSQL explicitly in the server startup path before the HTTP listener begins accepting traffic. A failed connection must fail startup cleanly with a non-zero exit and a safe log message.
- Integrate Prisma disconnect into the existing idempotent graceful shutdown path. Ensure HTTP server close and database disconnect are awaited and do not introduce duplicate signal handlers or regress JMP-26's bounded fatal-error shutdown.
- Keep `apps/api/src/app.ts` request/middleware tests independent of a live database. Do not add health/readiness endpoints in this issue; those belong to JMP-31.

## 7. Data model scope

Implement the approved logical model from the three ERD views. Use singular PascalCase Prisma model names and map physical PostgreSQL table/column names to the existing snake_case ERD naming convention. Use UUID primary keys for domain entities unless a documented join table uses a composite primary key.

The baseline model must include these entities (do not silently omit a group):

### Identity and platform access

- `User`
- `UserSession`
- `EmailVerificationToken`
- `PasswordResetToken`
- `PlatformRole`
- `Permission`
- `RolePermission`
- `UserPlatformRole`

### Candidate profile

- `JobSeekerProfile`
- `Education`
- `WorkExperience`
- `Skill`
- `ProfileSkill`
- `Resume`

### Employer account and verification

- `EmployerAccount`
- `EmployerMembership`
- `IndividualEmployerProfile`
- `OrganizationProfile`
- `EmployerVerificationRequest`
- `EmployerVerificationDocument`
- `EmployerVerificationEvent`

### Marketplace

- `JobCategory`
- `Job`
- `JobSkill`
- `JobEligibleCountry`
- `JobStatusHistory`
- `SavedJob`

### Recruitment

- `Application`
- `ApplicationResumeSnapshot`
- `ApplicationStatusHistory`

### Engagement and operations

- `Notification`
- `NotificationPreference`
- `NotificationDelivery`
- `OutboxEvent`
- `Report`
- `ModerationAction`
- `AuditLog`

Use the ERD attributes as the starting point for each model. Preserve all documented foreign keys, optionality, one-to-one/one-to-many relationships, and composite keys. Add normal operational timestamps (`createdAt`, `updatedAt`) only where appropriate; do not add unrelated product features.

### Type mapping rules

- UUID identifiers and UUID foreign keys: PostgreSQL `uuid`.
- All persisted event/business timestamps: PostgreSQL `timestamptz(6)` and UTC instants. Use explicit nullable timestamps for optional lifecycle events.
- Salary and other fixed-precision monetary values: Prisma `Decimal` mapped to an explicit PostgreSQL `numeric(precision, scale)`. Never use floating-point types for money.
- Country codes: ISO 3166-1 alpha-2 (`char(2)` or validated bounded string). Currency: ISO 4217 (`char(3)` or validated bounded string).
- JSONB only for bounded outbox payloads and audit before/after snapshots as called for in the SRS. Do not replace core relational data with JSON.
- File records contain object keys and metadata, not binary file contents. Object storage remains private and is implemented outside this task.
- Use explicit lengths for bounded text fields where the ERD/business purpose warrants them; use `Text` for descriptions/bodies that are not naturally bounded.
- Use Prisma `@map` / `@@map` so TypeScript uses camelCase and PostgreSQL remains snake_case.

### Required state values and domain rules

Preserve the exact documented job and application lifecycle values:

- Job status: `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `PAUSED`, `CLOSED`, `EXPIRED`, `REJECTED`, `ARCHIVED`.
- Application status: `SUBMITTED`, `UNDER_REVIEW`, `SHORTLISTED`, `INTERVIEW`, `OFFERED`, `HIRED`, `REJECTED`, `WITHDRAWN`.
- Employer account type: `INDIVIDUAL`, `ORGANIZATION`.
- Employer membership roles: `OWNER`, `ADMIN`, `RECRUITER`, `HIRING_MANAGER` (the SRS identifies the last one as future-capable; retaining the value must not imply all its future permissions are active now).
- Initial platform role codes: `SUPER_ADMIN`, `JOB_MODERATOR`, `VERIFICATION_ADMIN`, `SUPPORT_ADMIN`.

For statuses or enumerations whose exact values are not fixed in the SRS/ERD (for example, some account, notification, delivery and outbox states), do not invent large state machines. Choose the smallest coherent representation, document the assumption in the schema/README, and leave business transition enforcement to later domain-service tasks. Use lookup records or bounded strings where a set is expected to evolve. Use enums for explicitly fixed state machines.

Implement the documented relationships/invariants:

- A person is one `User`, not mutually exclusive USER/EMPLOYER account types. A user may optionally have one job-seeker profile and may own or join multiple employer accounts.
- Employer-owned jobs reference `EmployerAccount`, not directly a user. Record the creating user separately.
- `EmployerAccount` type is `INDIVIDUAL` or `ORGANIZATION`, with one matching subtype profile. Enforce referential integrity and document any cross-table invariant that requires a transaction or deferred trigger; do not pretend a simple column `CHECK` can validate another table.
- An employer account owner is also expected to have an active `OWNER` membership; retain the owner FK and membership uniqueness so the later account-creation use case can enforce this in one transaction.
- Applications are unique per `(jobId, jobSeekerProfileId)` for the MVP and have one immutable resume snapshot per application. The snapshot must retain the object key and metadata even if the source resume is later removed.
- Each `Report` must target exactly one of job, employer account or reported user.
- Remote job eligibility is not implicitly global. Ensure the schema can distinguish “worldwide” from an explicitly listed set of eligible countries (add a `remoteWorldwide` flag if the ERD does not already contain one, and document why it is needed for BR-044).
- Passwords, refresh tokens, email verification tokens and password reset tokens are stored as secure hashes only; never seed or persist plaintext secrets.

## 8. Constraints and indexes

Implement the relevant SRS constraints and indexes in Prisma schema and/or explicit SQL in the initial migration:

- Unique normalized user email. The application stores it normalized (lowercase/trimmed); add a PostgreSQL `CHECK` constraint to reject non-normalized values if it is compatible with the chosen column semantics.
- Unique token hashes and session refresh-token hashes.
- Unique platform role codes and permission codes.
- Unique `(employer_account_id, user_id)` employer membership.
- Unique organization slug.
- Unique category slug and skill name/slug.
- Unique `(job_id, skill_id)`, `(job_seeker_profile_id, skill_id)`, `(job_seeker_profile_id, job_id)` for saved jobs, and `(job_id, job_seeker_profile_id)` for applications.
- Unique one-to-one application resume snapshot by `application_id`.
- Index common access paths from the SRS: jobs by `(status, published_at)`, employer account, category, country/city; applications by `(job_id, status)` and `(job_seeker_profile_id, created_at)`; plus FK lookup indexes where useful.
- Add bounded numeric checks for salary values (non-negative and maximum not below minimum when both are present).
- Add a PostgreSQL `CHECK` for reports requiring exactly one target FK to be non-null (for PostgreSQL, `num_nonnulls(job_id, employer_account_id, reported_user_id) = 1`).
- Add a partial unique index or equivalent for at most one active `PENDING` employer verification request per employer account, consistent with the chosen status representation.
- Add a GIN/full-text search index only if the current PostgreSQL/Prisma migration can express it reliably; otherwise document a follow-up migration boundary and the chosen search strategy. Do not introduce Elasticsearch or an external search service.

Keep custom SQL migrations readable and committed. Prisma schema validation alone is not evidence that the SQL-only constraints exist; inspect the generated `migration.sql` and test the resulting database constraints.

## 9. Seeding

Create `prisma/seed.ts` and configure it through the Prisma 7 config `migrations.seed` property.

- Seed deterministic, non-secret reference data only. At minimum, seed the four initial platform roles from the SRS. Seed permission codes and role-permission mappings only where their meaning is explicit in the SRS permission matrix; otherwise leave a clearly documented TODO for the authorization task rather than guessing privileges.
- Use `upsert`/unique stable codes so repeated runs are idempotent.
- Do not seed a real admin account, password, real user, real employer, private document, or fake personal data.
- Close/disconnect the Prisma client on both success and failure; return a non-zero exit on seed failure.
- In Prisma 7 seeding is explicit: `prisma db seed`. Do not assume `migrate dev` or `migrate reset` runs seeds automatically.

## 10. Package scripts and developer documentation

Add API package scripts using the installed Prisma 7 CLI and `--config prisma7.config.ts` where needed. Include equivalents of:

- `db:generate`
- `db:format`
- `db:validate`
- `db:migrate:dev` (must require a migration name, e.g. `--name init` through arguments or a clearly documented direct CLI command)
- `db:migrate:deploy`
- `db:migrate:status`
- `db:seed`
- `db:studio` (optional but useful)

Ensure `build` generates Prisma Client before TypeScript compilation if the generated client is not otherwise guaranteed to exist. Keep the root workspace scripts functioning and do not make the normal unit-test suite depend on a developer database.

Update the API README with:

1. PostgreSQL prerequisites and how to create a fresh local `jmp_dev` database (and a separate shadow database only if required by the user's local PostgreSQL permissions/setup).
2. How to copy `.env.example` to `.env` and set `DATABASE_URL` safely.
3. Install/generate/validate/migrate/seed commands.
4. Difference between development `migrate dev` and deployment `migrate deploy`.
5. How migration history is reviewed and committed with code.
6. A prominent warning that `migrate reset` destroys local data and must never be run against shared, staging or production databases. Do not add a casual reset script.
7. Note that `.env` is ignored by Git and real credentials must never be committed.

## 11. Testing and verification

Keep all existing JMP-24, JMP-25 and JMP-26 checks green.

Run and report the actual output/status for:

```bash
pnpm --filter @jmp/api db:format
pnpm --filter @jmp/api db:validate
pnpm --filter @jmp/api db:generate
pnpm --filter @jmp/api lint
pnpm --filter @jmp/api typecheck
pnpm --filter @jmp/api test
pnpm --filter @jmp/api build
pnpm workspace:check
pnpm check
```

With a confirmed **new local development database** configured:

```bash
pnpm --filter @jmp/api db:migrate:dev -- --name init
pnpm --filter @jmp/api db:migrate:status
pnpm --filter @jmp/api db:seed
```

Then verify the clean-database result by querying PostgreSQL/Prisma to confirm expected tables, migration history, key unique constraints and the seeded platform roles. Run a minimal API database-connect smoke test (for example `$connect()` and `SELECT 1`) without adding a public health route; JMP-31 owns health/readiness endpoints.

If a local database service is unavailable, complete the schema/config/tests and provide exact PostgreSQL setup instructions, but explicitly report that clean-database migration acceptance is still blocked. Do not claim a migration was applied if only `prisma validate` or `migrate diff` passed.

## 12. Scope boundaries — do not absorb other Jira tasks

This task owns the PostgreSQL/Prisma foundation, data model, migration history, seed mechanism and API database connection lifecycle only.

Keep these separate:

- JMP-28: shared Zod contracts package.
- JMP-29: centralized environment validation and general lint/format/test tooling refinements. Only add the minimal database URL guard required here.
- JMP-31: Docker Compose/local database service orchestration and API health/readiness endpoints. Do not add Compose services or public health routes in JMP-27.
- JMP-32: GitHub Actions CI.
- Later product sprints: registration/auth flows, employer CRUD/workflows, jobs, applications, notifications, moderation endpoints and domain services. Do not implement these APIs in this task.

Do not introduce microservices, a second ORM, raw SQL repositories for ordinary CRUD, object-storage provider integration, background workers or production credentials.

## 13. Final handoff response

When implementation is complete, report:

1. Files added/changed and the resulting database/Prisma architecture.
2. Prisma ORM version and adapter versions actually installed.
3. Entity/model count and any documented assumptions where the ERD did not define exact field values.
4. Migration name and whether it was applied to a newly created local database.
5. Seed behavior and seeded reference records.
6. Exact verification commands and pass/fail output (including the full workspace `pnpm check`).
7. Any acceptance criterion not verified and the blocker.
8. Risks or follow-up work intentionally left for JMP-28, JMP-29, JMP-31 or later domain sprints.

Do not claim completion merely because files were generated. Preserve a clean diff, keep unrelated user changes untouched, and make the implementation easy to review.
