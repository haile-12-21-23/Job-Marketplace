# JMP-33 Implementation Handoff — Register a New User Account

**Jira Issue:** [JMP-33 — Register a new user account](https://hailemariamaddisu21.atlassian.net/browse/JMP-33)  
**Sprint:** Sprint 2 — Authentication & Authorization  
**Branch:** `JMP-33—Register-new-user-account`  
**Date:** 2026-11-25  
**Status:** COMPLETE & VERIFIED LOCALLY

---

## 1. Executive Summary

JMP-33 implements the visitor registration capability for creating a base `User` identity in the Job Marketplace platform:

- **Identity Domain:** Created `apps/api/src/modules/identity/` following the modular monolith architectural baseline.
- **Shared Contracts:** Auth schemas and types added to `@jmp/contracts` with `.strict()` write validation and deterministic email normalization (`normalizeEmail(email) = email.trim().toLowerCase()`).
- **Endpoint:** `POST /api/v1/auth/register` returning `201 Created` with standard single-resource response envelope (`{ data: { id, displayName, email, emailVerificationRequired: true } }`) and `Location` header.
- **Security & Password Hashing:** Passwords hashed asynchronously using `bcryptjs` (salt rounds: 10). Plaintext passwords and hashes are never exposed in responses or logs. Pino HTTP logger redacts `req.body.password`.
- **Database & State:** Reuses existing Prisma `User` model and PostgreSQL schema. Initial user status is `UserStatus.ACTIVE` (matching `@default(ACTIVE)`), while unverified standing is authoritatively represented by `emailVerifiedAt: null`. Uniqueness is enforced both via pre-insert check and PostgreSQL unique index (`users_email_key`) with Prisma `P2002` error mapping to 409 Conflict Problem Details.
- **Scope Discipline:** No sessions, verification tokens, candidate profiles, employer accounts, or platform roles are created.
- **Frontend Registration UI:** Minimal, functional, accessible registration form created at `/register` in `apps/web` wired to RTK Query mutation `useRegisterMutation`.

---

## 2. API Endpoint Specification

### `POST /api/v1/auth/register`

- **Content-Type:** `application/json`
- **Request Body Contract:**

  ```json
  {
    "displayName": "Hailemariam Addisu",
    "email": "haile@example.com",
    "password": "SecurePassword123!"
  }
  ```
  - `displayName`: String, trimmed, min 2, max 120 chars.
  - `email`: String, trimmed, valid email format, max 255 chars (normalized to lowercase by backend).
  - `password`: String, min 8, max 100 chars.
  - Unknown fields: Rejected with HTTP 422 (`.strict()`).

- **Success Response (HTTP 201 Created):**
  - **Headers:** `Location: /api/v1/users/{id}`, `X-Request-Id: {uuid}`, `Content-Type: application/json`
  - **Body:**
    ```json
    {
      "data": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "displayName": "Hailemariam Addisu",
        "email": "haile@example.com",
        "emailVerificationRequired": true
      }
    }
    ```

- **Conflict Response (HTTP 409 Conflict):**
  - **Content-Type:** `application/problem+json`
  - **Body:**
    ```json
    {
      "type": "about:blank",
      "title": "Conflict",
      "status": 409,
      "code": "EMAIL_ALREADY_EXISTS",
      "detail": "An account with this email address already exists.",
      "instance": "/api/v1/auth/register",
      "requestId": "550e8400-...",
      "errors": [
        {
          "pointer": "#/email",
          "code": "DUPLICATE_EMAIL",
          "detail": "An account with this email address already exists."
        }
      ]
    }
    ```

- **Validation Failure (HTTP 422 Unprocessable Entity):**
  - **Content-Type:** `application/problem+json`
  - **Body:** RFC 9457 Problem Details with stable code `VALIDATION_ERROR` and field pointers (`#/displayName`, `#/email`, `#/password`).

---

## 3. Database & Schema Discipline

- **Schema Migration Status:** **NO MIGRATION REQUIRED**.
- **Explanation:** The initial migration (`20261124110222_init`) already models the complete `User` table, `UserStatus` enum, unique index `users_email_key`, check constraint `chk_users_email_normalized`, and nullable `email_verified_at TIMESTAMPTZ(6)`.
- **User Status Semantics:** Initial user status is `UserStatus.ACTIVE` (matching schema `@default(ACTIVE)` and database default). Unverified status is represented by `emailVerifiedAt: null`. `UserStatus` (`ACTIVE`, `INACTIVE`, `SUSPENDED`, `DELETED`) represents account operational standing, not email verification.

---

## 4. Files Created and Modified

### Created:

1. `packages/contracts/src/auth/registration.ts`: Schemas, types, and `normalizeEmail` helper.
2. `packages/contracts/src/auth/index.ts`: Auth domain exports barrel.
3. `packages/contracts/src/auth/registration.test.ts`: 12 unit tests for auth contracts.
4. `apps/api/src/middleware/validate.ts`: Reusable Zod body validation middleware.
5. `apps/api/src/modules/identity/domain/password-hasher.ts`: `PasswordHasher` interface and `BcryptPasswordHasher` implementation.
6. `apps/api/src/modules/identity/ports/user.repository.ts`: `UserRepository` port and DTO interfaces.
7. `apps/api/src/modules/identity/infrastructure/prisma-user.repository.ts`: `PrismaUserRepository` with Prisma `P2002` error mapping.
8. `apps/api/src/modules/identity/infrastructure/prisma-user.repository.test.ts`: Repository error translation and integration tests.
9. `apps/api/src/modules/identity/application/register-user.use-case.ts`: Use case orchestrating normalization, pre-check, hashing, and persistence.
10. `apps/api/src/modules/identity/application/register-user.use-case.test.ts`: Use case unit tests with mock repository and fake hasher.
11. `apps/api/src/modules/identity/identity.controller.ts`: Controller mapping HTTP requests to use case.
12. `apps/api/src/modules/identity/identity.routes.ts`: Router mounting `POST /register`.
13. `apps/api/src/modules/identity/identity.routes.test.ts`: Supertest API integration tests (6 tests).
14. `apps/api/src/modules/identity/index.ts`: Identity module composition exports.
15. `apps/web/src/services/auth-api.ts`: RTK Query endpoint injecting `register` mutation into `baseApi`.
16. `apps/web/src/pages/RegisterPage.tsx`: Accessible registration page component.
17. `apps/web/src/pages/RegisterPage.test.tsx`: Component tests for registration flow (5 tests).
18. `JMP-33-handoff.md`: This implementation handoff document.

### Modified:

1. `packages/contracts/src/index.ts`: Re-exported auth contracts.
2. `packages/contracts/src/index.test.ts`: Added assertions for auth domain exports and type compatibility.
3. `apps/api/package.json`: Added `bcryptjs` and `@types/bcryptjs`.
4. `apps/api/src/types/problem-details.ts`: Added `errors?: ProblemDetailErrorItem[]`.
5. `apps/api/src/errors/app-error.ts`: Added optional `errors?: ProblemDetailErrorItem[]`.
6. `apps/api/src/middleware/error-handler.ts`: Added `ZodError` handling and problem details `errors` array support.
7. `apps/api/src/routes/v1/index.ts`: Mounted `/auth` subrouter using `createIdentityRouter()`.
8. `apps/api/src/routes/index.ts`: Passed identity options to v1 router.
9. `apps/api/src/app.ts`: Injected identity options and added `'req.body.password'` to pinoHttp redact list.
10. `apps/api/src/contracts.test.ts`: Added auth contract integration tests.
11. `apps/web/src/app/router.tsx`: Added `/register` route.
12. `apps/web/src/app/router.test.tsx`: Added route test for `/register`.
13. `apps/web/src/contracts.test.ts`: Added auth contract integration test.
14. `apps/web/src/layouts/PublicLayout.tsx`: Added visible "Register" navigation link.
15. `pnpm-lock.yaml`: Updated for `bcryptjs`.

---

## 5. Verification & Test Results

### 5.1 Test Suites Count & Results

- **`@jmp/config`**: 1 passed (1 test)
- **`@jmp/contracts`**: 4 passed (51 tests)
- **`@jmp/api`**: 9 passed (58 tests)
- **`@jmp/web`**: 9 passed (34 tests)
- **Total Workspace Tests**: **144 tests passed (0 failed)** across 23 test suites.

### 5.2 Quality Checks & Builds

- **Prettier:** `pnpm format:check` -> All matched files use Prettier code style!
- **ESLint:** `pnpm lint` -> 4 workspace packages passed with 0 errors and 0 warnings.
- **TypeScript:** `pnpm typecheck` -> 4 workspace packages passed with 0 errors.
- **Full Monorepo Suite:** `pnpm check` -> **PASS (exit code 0)**.
- **Workspace Validation:** `node scripts/check-workspace.mjs` -> `Workspace structure OK (4 packages; all workspace:* references resolve)`.
- **Production Package Builds:**
  - `pnpm --filter @jmp/contracts run build` -> `tsc -p tsconfig.build.json` succeeded.
  - `pnpm --filter @jmp/api run build` -> `pnpm db:generate && tsc -p tsconfig.build.json` succeeded.
  - `pnpm --filter @jmp/web run build` -> `tsc --noEmit && vite build` succeeded (bundle: 480 kB JS, 23 kB CSS).
- **Compiled Artifact Resolution:** Compiled `dist/app.js` resolves `@jmp/contracts` without runtime errors.

---

## 6. Assumptions, Blockers, and Repository Notes

1. **Sprint 1 Tracked `node_modules` Anomaly:**
   - Previous commits in Sprint 1 (`5712891`, `52ad190`, `3b6a7df`) unintentionally tracked several files in `node_modules`.
   - Running `pnpm install` or test runners touches pnpm internal state files (`node_modules/.pnpm-workspace-state-v1.json`, etc.).
   - No custom code or credentials were placed into `node_modules`. No branch rewrite or destructive git action was performed.
2. **Explicit Out-of-Scope Boundaries Preserved:**
   - Email verification token generation, expiration, resend throttling, and email delivery belong to JMP-34 and were strictly excluded.
   - Session tokens, JWT creation, refresh cookies, and session revocation belong to JMP-35/36 and were strictly excluded.
   - Password reset belongs to JMP-37 and was excluded.
   - Profile creation (Candidate/Employer) and platform roles belong to downstream stories.
   - Broad responsive auth UI layout and visual polish belong to JMP-40.
3. **No Database Migration Required:**
   - Migration `20261124110222_init` already contained the exact approved columns, constraints (`chk_users_email_normalized`), and enum `UserStatus`.
4. **Current Git Status:**
   - In accordance with user instructions, no commits, merges, or pushes have been performed. All changes reside on branch `JMP-33—Register-new-user-account`.

---

## 7. Acceptance Criteria Verification Matrix

| Acceptance Criterion                                  | Implementation Details                                                                                                                                                                                                           | Evidence & Test Coverage                                                                                                                                                                                                                                                     |
| :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC 1: Base User Identity Creation**                 | Created `RegisterUserUseCase` persisting base `User` entity with `displayName`, normalized `email`, and bcrypt `passwordHash`.                                                                                                   | `apps/api/src/modules/identity/application/register-user.use-case.test.ts`<br>`apps/api/src/modules/identity/identity.routes.test.ts` (Scenario: _successfully registers a new user_)                                                                                        |
| **AC 2: Email Normalization & Uniqueness**            | Backend helper `normalizeEmail(email)` applies `.trim().toLowerCase()`. PostgreSQL unique index `users_email_key` guarantees concurrency safety; Prisma `P2002` maps to 409 Conflict (`EMAIL_ALREADY_EXISTS`).                   | `packages/contracts/src/auth/registration.test.ts` (12 tests)<br>`apps/api/src/modules/identity/infrastructure/prisma-user.repository.test.ts` (2 tests)<br>`apps/api/src/modules/identity/identity.routes.test.ts` (Scenarios: duplicate email, case-insensitive collision) |
| **AC 3: Secure Password Hashing & Secret Protection** | `BcryptPasswordHasher` uses `bcryptjs` with 10 salt rounds. Passwords/hashes are never returned in DTOs. Pino HTTP logger redacts `'req.body.password'`.                                                                         | `apps/api/src/modules/identity/domain/password-hasher.ts`<br>`apps/api/src/app.ts` (`redact` configuration)<br>`apps/api/src/modules/identity/identity.routes.test.ts` (Password hash verification & response sanitization)                                                  |
| **AC 4: Unverified Standing & Scope Isolation**       | Sets `emailVerifiedAt: null` and `status: UserStatus.ACTIVE`. No sessions, JWTs, cookies, verification tokens, candidate profiles, employer accounts, or roles are created.                                                      | `apps/api/src/modules/identity/application/register-user.use-case.ts`<br>`apps/api/src/modules/identity/identity.routes.test.ts` (Assertions on `emailVerifiedAt` and response)                                                                                              |
| **AC 5: API Endpoint Contract & Response Envelope**   | `POST /api/v1/auth/register` returns `201 Created` with `Location: /api/v1/users/{id}`, `X-Request-Id`, and body `{ data: { id, displayName, email, emailVerificationRequired: true } }`. Unknown body fields rejected with 422. | `packages/contracts/src/auth/registration.ts`<br>`apps/api/src/modules/identity/identity.routes.test.ts` (Validation and success envelope checks)                                                                                                                            |
| **AC 6: Functional & Accessible Registration UI**     | Page mounted at `/register` in `apps/web` with accessible form labels, inline field errors, disabled submit on loading, error banner, password cleared on submit, and verification notice.                                       | `apps/web/src/pages/RegisterPage.tsx`<br>`apps/web/src/pages/RegisterPage.test.tsx` (5 tests)<br>`apps/web/src/app/router.test.tsx`                                                                                                                                          |
| **AC 7: Quality Checks & Regression Prevention**      | All workspace packages pass lint, format, typecheck, unit tests, and production builds without regression to Sprint 1 features.                                                                                                  | `pnpm check` (144 tests passed, 0 errors, 0 warnings)<br>`node scripts/check-workspace.mjs` (PASSED)<br>Production builds for `@jmp/contracts`, `@jmp/api`, and `@jmp/web` all succeeded.                                                                                    |
