# JMP-27 Implementation Handoff & Test Results

## 1. Summary of Changes & Architecture

### Database & Prisma Architecture

JMP-27 establishes the foundational PostgreSQL and Prisma 7 persistence layer for `@jmp/api` across all 6 logical domains defined in the approved ERD specification:

- **Prisma 7 Configuration (`apps/api/prisma7.config.ts`)**: Configured with `defineConfig`, pointing to PostgreSQL datasource, generator output `./src/generated/prisma`, and migration seeder `tsx prisma/seed.ts`.
- **Complete Logical Data Model (`apps/api/prisma/schema.prisma`)**: Models all 37 ERD domain entities and 17 enums with UUID primary keys, explicit PostgreSQL type mappings (`timestamptz(6)`, `numeric(12,2)` for salary, `uuid`), and PascalCase models mapped to snake_case physical tables and columns via `@map` / `@@map`.
- **Initial Migration (`apps/api/prisma/migrations/20261124110222_init/migration.sql`)**: Generated and applied via `prisma migrate dev`. Augmented with explicit PostgreSQL `CHECK` constraints (email normalization, non-negative salary, max >= min salary range, single report target invariant) and a partial unique index (`uq_employer_verification_pending` for pending employer verification requests).
- **Database Configuration Guard (`apps/api/src/config/database-config.ts`)**: Minimal database-specific guard validating existence, URL scheme (`postgresql:` or `postgres:`), host, and database name. Fast-fails cleanly without leaking credentials in logs or exceptions.
- **Prisma Client & Pool Singleton (`apps/api/src/infrastructure/database/prisma.ts`)**: Configures `pg.Pool` with bounded connection settings (`connectionTimeoutMillis: 5000`, `max: 10`, `idleTimeoutMillis: 30000`), integrates `@prisma/adapter-pg` with `PrismaPg`, and exposes a lazy singleton `prisma` client, `connectDatabase()`, and `disconnectDatabase()`.
- **API Lifecycle Integration (`apps/api/src/server.ts`)**: Preserves pure `createApp()` isolation in `src/app.ts`. Server process startup connects to PostgreSQL via `connectDatabase()` with a smoke test query (`SELECT 1`) before listening. Graceful shutdown closes HTTP listener and awaits `disconnectDatabase()`.
- **Deterministic Seeder (`apps/api/prisma/seed.ts`)**: Idempotently seeds the 4 initial platform roles using `upsert`. Granular permissions left for JMP-Auth.

---

## 2. Package & Dependency Versions

Installed in `apps/api`:

- **Prisma CLI**: `7.10.1` (`prisma`)
- **Prisma Client**: `7.10.1` (`@prisma/client`)
- **Prisma PostgreSQL Adapter**: `7.10.1` (`@prisma/adapter-pg`)
- **PostgreSQL Driver**: `8.13.3` (`pg`), `@types/pg: ^8.11.11`
- **Dotenv**: `^16.4.7` (`dotenv`)
- **Database Engine**: PostgreSQL 14 (local instance on port 5432)

---

## 3. Entity & Model Count

- **Total Domain Models**: 37 models mapped to 37 tables (+ 1 `_prisma_migrations` system table = 38 physical tables).
- **Total Enums**: 17 PostgreSQL enums.

### Entities by Logical Domain:

1. **Identity and Platform Access (8 models)**:
   - `User`, `UserSession`, `EmailVerificationToken`, `PasswordResetToken`, `PlatformRole`, `Permission`, `RolePermission`, `UserPlatformRole`
2. **Candidate Profile (6 models)**:
   - `JobSeekerProfile`, `Education`, `WorkExperience`, `Skill`, `ProfileSkill`, `Resume`
3. **Employer Account and Verification (7 models)**:
   - `EmployerAccount`, `EmployerMembership`, `IndividualEmployerProfile`, `OrganizationProfile`, `EmployerVerificationRequest`, `EmployerVerificationDocument`, `EmployerVerificationEvent`
4. **Marketplace (6 models)**:
   - `JobCategory`, `Job`, `JobSkill`, `JobEligibleCountry`, `JobStatusHistory`, `SavedJob`
5. **Recruitment (3 models)**:
   - `Application`, `ApplicationResumeSnapshot`, `ApplicationStatusHistory`
6. **Engagement and Operations (7 models)**:
   - `Notification`, `NotificationPreference`, `NotificationDelivery`, `OutboxEvent`, `Report`, `ModerationAction`, `AuditLog`

### Documented Assumptions:

- `Job`: Added `remoteWorldwide Boolean @default(false)` to distinguish worldwide remote eligibility from an explicitly listed set of countries in `job_eligible_countries` (BR-044).
- `EmployerAccount`: Subtype profiles (`IndividualEmployerProfile`, `OrganizationProfile`) reference `EmployerAccount` with `@unique` on foreign keys. Cross-table mutual exclusivity is documented for domain service transactions.
- `ApplicationResumeSnapshot`: One-to-one with `Application` (`application_id` unique). Retains frozen object storage key and file metadata even if source `Resume` is later soft-deleted or removed.
- `PlatformRole`: Seeds the 4 platform roles (`SUPER_ADMIN`, `JOB_MODERATOR`, `VERIFICATION_ADMIN`, `SUPPORT_ADMIN`). Granular permission codes and role-permission mappings contain an explicit TODO for the JMP-Auth sprint.

---

## 4. Migration & Clean Database Application

- **Migration Name**: `20261124110222_init`
- **Target Database**: `jmp_dev` (cleanly created local PostgreSQL database)
- **Shadow Database**: `jmp_shadow` (cleanly created local shadow database)
- **Status**: Applied cleanly. Verified schema status: `Database schema is up to date!`.
- **Database Schema Verification (`psql`)**:
  - `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';` -> **38 tables**.
  - `chk_users_email_normalized`: Verified (`email = lower(trim(email))`).
  - `chk_jobs_salary_non_negative`: Verified (`salary_min >= 0 AND salary_max >= 0`).
  - `chk_jobs_salary_range`: Verified (`salary_max >= salary_min`).
  - `chk_reports_single_target`: Verified (`num_nonnulls(job_id, employer_account_id, reported_user_id) = 1`).
  - `uq_employer_verification_pending`: Verified (partial unique index on `employer_account_id` where `status = 'PENDING'`).

---

## 5. Seed Behavior & Reference Records

- Seed script: `apps/api/prisma/seed.ts` executed via `pnpm --filter @jmp/api db:seed`.
- Execution: Idempotent `upsert` on `PlatformRole.code`.
- Seeded Records:
  1. `SUPER_ADMIN` - "Super Administrator" (Full platform administration privileges across all domains)
  2. `JOB_MODERATOR` - "Job Moderator" (Review, approve, reject, and moderate job postings)
  3. `VERIFICATION_ADMIN` - "Verification Administrator" (Review and approve or reject employer verification requests)
  4. `SUPPORT_ADMIN` - "Support Administrator" (Customer support, report resolution, and platform inquiries)
- Idempotency: Re-running `db:seed` produces identical clean results without duplicate record creation or errors.
- Verification Query: `SELECT code, name, description FROM platform_roles ORDER BY code;` returns all 4 records.

---

## 6. Verification Results

All required verification commands were executed and passed cleanly:

| Command                                    | Status   | Output / Details                                                                                                    |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @jmp/api db:format`         | **PASS** | `Formatted prisma/schema.prisma in 34ms`                                                                            |
| `pnpm --filter @jmp/api db:validate`       | **PASS** | `The schema at prisma/schema.prisma is valid`                                                                       |
| `pnpm --filter @jmp/api db:generate`       | **PASS** | `Generated Prisma Client (7.10.1) to ./src/generated/prisma in 169ms`                                               |
| `pnpm --filter @jmp/api db:migrate:dev`    | **PASS** | `Applying migration 20261124110222_init ... Your database is now in sync with your schema.`                         |
| `pnpm --filter @jmp/api db:migrate:status` | **PASS** | `1 migration found in prisma/migrations. Database schema is up to date!`                                            |
| `pnpm --filter @jmp/api db:seed`           | **PASS** | `Initial platform roles seeded successfully.` (4 roles upserted)                                                    |
| `pnpm --filter @jmp/api lint`              | **PASS** | `eslint src --max-warnings=0` (0 errors, 0 warnings)                                                                |
| `pnpm --filter @jmp/api typecheck`         | **PASS** | `tsc --noEmit -p tsconfig.json` (0 type errors)                                                                     |
| `pnpm --filter @jmp/api test`              | **PASS** | 4 test suites passed, 23 tests passed (`app.test.ts`, `database-config.test.ts`, `prisma.test.ts`, `index.test.ts`) |
| `pnpm --filter @jmp/api build`             | **PASS** | `pnpm db:generate && tsc -p tsconfig.build.json` succeeded cleanly                                                  |
| `pnpm workspace:check`                     | **PASS** | `Workspace structure OK (4 packages; all workspace:* references resolve)`                                           |
| `pnpm check`                               | **PASS** | Full workspace check (all packages lint, typecheck, and test green)                                                 |

---

## 7. Acceptance Criteria Status

All acceptance criteria defined in `JMP-27-instruction.md` have been fully met and verified against live PostgreSQL:

- [x] API connects to PostgreSQL using validated `DATABASE_URL` without credential exposure in logs.
- [x] Prisma schema validates and Prisma Client is generated via Prisma 7.
- [x] Complete initial migration (`init`) for approved JMP logical data model applied to newly created local development database `jmp_dev`.
- [x] Deterministic, idempotent seed workflow (`prisma/seed.ts`).
- [x] API README updated with database setup, migration, status, generation, and seed commands.
- [x] Existing development/build/test workflows (`pnpm check`) remain green, preserving pure `createApp()` isolation (zero DB connection in unit tests).

**Acceptance criteria not verified**: None. Everything is 100% verified.

---

## 8. Scope Boundaries & Next Steps

In strict adherence to the project roadmap and scope boundaries:

- **JMP-28**: Shared Zod contracts package.
- **JMP-29**: Centralized environment validation and tooling refinements. The minimal `database-config.ts` guard implemented here is isolated and prepared for replacement by JMP-29.
- **JMP-31**: Docker Compose orchestration and health/readiness endpoints (`/health`, `/health/live`, `/health/ready`).
- **JMP-32**: GitHub Actions CI/CD workflows.
- **Future Product Sprints**: Authentication, user registration, domain CRUD operations, and authorization matrix (permission seeding).
