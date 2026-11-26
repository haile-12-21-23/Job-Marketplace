# JMP-35 — Log In and Establish a Secure Session

**Jira:** https://hailemariamaddisu21.atlassian.net/browse/JMP-35  
**Repository:** `haile-12-21-23/Job-Marketplace`  
**Sprint:** Sprint 2 — Authentication & Authorization  
**Priority:** Highest  
**Base branch:** `master`  
**Verified base commit:** `68070af7351fd39366da09447276f9ec3f5e8bb6` (merged JMP-34 / PR #15)

## 1. Objective

Implement the login capability for an existing, email-verified JMP user. A successful login must validate credentials, create a persisted server-side session, issue a short-lived access token, and set an opaque refresh credential in an HttpOnly cookie for the future refresh flow.

Build on the existing identity module, password hasher, `User` model, `UserSession` model, shared contracts, Express conventions, and React/RTK Query setup. Do not recreate registration or email verification.

## 2. Jira acceptance criteria

- Valid credentials establish an authenticated session.
- Invalid credentials return a generic error.
- The access token is short-lived.
- The refresh credential uses `Secure`, `HttpOnly`, and appropriate `SameSite` cookie settings.
- Login is rate-limited and tested.

## 3. Mandatory repository inspection — inspect before editing

1. Confirm `git status --short` is clean (or preserve and report existing user changes), fetch `origin`, and create the task branch from the latest `origin/master`. The expected starting commit at task preparation was `68070af7351fd39366da09447276f9ec3f5e8bb6`; verify it is still the latest before branching.
2. Read `AGENTS.md` and any package-level instructions if present.
3. Inspect these current implementations and their tests before changing them:
   - `apps/api/src/modules/identity/` — routes, controller, use cases, password hasher, user repository, dependency composition, tests.
   - `apps/api/prisma/schema.prisma` and the migration that creates `user_sessions`.
   - `apps/api/src/config/env.ts`, `server.ts`, `app.ts`, CORS, request logging/redaction, error handling, and validation middleware.
   - `apps/web/src/services/base-api.ts`, `auth-api.ts`, store/hooks/providers, router, `RegisterPage`, `AuthenticatedLayout`, and route tests.
   - `packages/contracts/src/auth/` and the package export barrel.
4. Verify the actual `UserSession` database table exists in the migration history. The current Prisma schema already defines `UserSession` with `id`, `userId`, `tokenFamilyId`, `refreshTokenHash`, `parentSessionId`, `expiresAt`, `revokedAt`, and `createdAt`. Reuse it; do not add a duplicate session model. Add a migration only if the committed migration/database history proves a required schema element is missing.
5. Confirm how Prisma client transactions, test injection, the generated enum `UserStatus`, and PostgreSQL integration tests are currently handled.
6. Check the actual installed dependencies and lockfile before adding a token library. Do not hand-roll JWT serialization/signature verification. Prefer an existing maintained JWT implementation; if none exists, use a maintained library such as `jose` and justify the minimal dependency change.
7. Present a concise plan and list the expected files before implementation. Report genuine schema or architecture gaps rather than inventing a replacement design.

## 4. Authentication rules

### 4.1 User lookup and verification gate

- Normalize the submitted email with the existing `normalizeEmail` helper from `@jmp/contracts`.
- Verify the password with the existing `PasswordHasher` / `BcryptPasswordHasher` abstraction. Do not duplicate or downgrade password hashing.
- Only allow a user whose `status` is `UserStatus.ACTIVE` **and** whose `emailVerifiedAt` is non-null.
- `UserStatus.ACTIVE` does not mean the email is verified. `emailVerifiedAt` is the authoritative email-verification gate.
- Unknown email, incorrect password, unverified email, and non-active account states must receive the same public authentication failure response. Do not reveal whether an email exists, whether its password was correct, or which account state blocked login.
- Use a dummy password-hash comparison for unknown users where practical to reduce obvious user-enumeration timing differences. Keep bcrypt verification asynchronous and at the established work factor.
- Never return or log `passwordHash`.

### 4.2 Access token

- Issue a signed, short-lived access token only after successful credential, status, and email-verification checks.
- Use a maintained JWT implementation; do not implement JWT signing or parsing by hand.
- Pin the permitted signing algorithm. Do not accept an algorithm selected by an untrusted token header during verification.
- Include only necessary claims. At minimum use `sub` for the user ID, `sid` for the persisted session ID, `iat`, `exp`, a stable `iss`, a stable `aud`, and a unique `jti` where supported.
- Use a configurable, bounded access-token TTL. Default: 900 seconds (15 minutes); allow a conservative range such as 60–3600 seconds.
- The signing secret/key must be high entropy, supplied through environment configuration, validated at startup, and never logged or committed. Do not silently use a known development or production fallback. Document a safe local generation command (for example, `openssl rand -hex 32`).
- Do not put passwords, password hashes, refresh credentials, verification tokens, or unnecessary PII into the token.

### 4.3 Refresh credential and persisted session

- Generate an opaque refresh credential using `node:crypto` secure randomness (at least 32 random bytes, base64url encoded). It is not a JWT.
- Store only a cryptographic hash of the refresh credential in `UserSession.refreshTokenHash`; never store the raw refresh credential.
- Create a new `UserSession` with the authenticated `userId`, a new `tokenFamilyId`, `parentSessionId: null`, a configurable expiry, and `revokedAt: null`. Use the created session ID as the access token's `sid` claim.
- Default refresh-session lifetime: 30 days, configurable and bounded (for example 1–90 days).
- Persist the session before returning success or setting the cookie. If persistence fails, do not issue a usable cookie or return an access token.
- Do not expose the raw refresh credential in JSON, headers other than `Set-Cookie`, logs, traces, analytics, or error messages.

### 4.4 Refresh cookie

Set the refresh credential using Express's response cookie support or an existing project abstraction. Do not add a cookie parsing dependency just to set a cookie.

Required attributes:

- `HttpOnly: true` in all environments.
- `Secure: true` in production. It may be false only for local HTTP development/test.
- `SameSite: Lax` by default for the current first-party web/API arrangement. Make the policy configurable if the architecture needs cross-site frontend/API hosting; use `SameSite=None` only with `Secure=true` and HTTPS. Do not silently weaken the policy.
- A narrow path that includes the planned JMP-36 refresh and revocation endpoints, such as `/api/v1/auth`.
- Do not set a broad `Domain` attribute; keep the cookie host-only.
- Use a clear, stable cookie name. A `__Secure-` prefixed production name is acceptable when `Secure` is always true.
- Configure the browser request to include credentials and preserve the existing credentialed CORS allowlist. Never use wildcard CORS origins with credentials.

Document that local frontend and API origins are currently different ports on localhost; the browser still requires `credentials: 'include'` for cross-origin fetch requests. Verify cookie behavior in an actual browser where available.

## 5. API contract

Add strict shared Zod contracts in `packages/contracts/src/auth/` and export them through the existing barrel. Follow existing conventions, `.strict()` unknown-key rejection, `{ data: ... }` success envelopes, and RFC 9457 Problem Details errors.

### `POST /api/v1/auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "CorrectHorseBatteryStaple123!"
}
```

- Normalize email using the existing shared helper.
- Validate input with a strict shared schema. Reuse the established password length policy where appropriate; do not apply registration-only display-name validation.
- Return `200 OK` on success and set the refresh cookie.
- Return only a safe response DTO, for example:

```json
{
  "data": {
    "accessToken": "SIGNED_SHORT_LIVED_ACCESS_TOKEN",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "USER_UUID",
      "displayName": "Example User",
      "email": "user@example.com"
    }
  }
}
```

- Never include the refresh credential or Prisma session record in the response body.
- For every authentication failure described in section 4.1, return the same safe `401` Problem Details code and generic detail, for example `INVALID_CREDENTIALS` / `Invalid email or password.`
- Invalid request shape/fields may return the standard `422 VALIDATION_ERROR` response from the existing validation middleware.
- Apply a login-specific rate limit. Return `429 RATE_LIMIT_EXCEEDED` with `Retry-After` when a limit is exceeded. Rate-limit behavior must not reveal account existence.

Do not add refresh, logout, session revocation, or password reset endpoints in this issue; those are tracked by JMP-36 and JMP-37.

## 6. Backend implementation boundaries

- Extend the existing identity module rather than creating a second authentication module.
- Follow its ports/use-case/controller/routes/infrastructure structure and dependency injection/testing patterns.
- Add the smallest required interfaces, such as a credential lookup method that returns a password hash only to the login use case and a session repository that creates `UserSession` rows. Keep internal credential records separate from browser DTOs.
- Ensure the current `UserRepository.findByEmail` safe projection is not casually changed to expose password hashes to unrelated callers. Prefer an explicitly named credential lookup method/port.
- Use a dedicated login use case; keep controller logic thin.
- Add login-specific rate limiting for both client IP and normalized email/identifier. Follow the existing sliding-window conventions where suitable, but avoid leaking raw email addresses in limiter keys or logs (hash the normalized identifier for in-memory keys if appropriate).
- Configure limits and time windows through validated environment variables, with conservative defaults (suggested starting point: IP 10 attempts / 15 minutes; normalized identifier 5 attempts / 15 minutes). Do not add a general rate-limit framework.
- Ensure rate limiter state is bounded/pruned and injectable with a clock for deterministic tests. Note the existing JMP-34 resend limiter is in-memory and per API process; document that production multi-instance deployments need a shared limiter such as Redis.
- Do not trust arbitrary forwarded IP headers. Respect `req.ip` only under an explicitly configured trusted-proxy deployment policy; do not enable permissive proxy trust as a shortcut.
- Add `req.body.email` to request-log redaction if auth email fields could otherwise be logged. Preserve redaction of passwords, cookies, authorization headers, and verification tokens.
- Do not create platform roles or profiles. Role assignment and authorization middleware belong to JMP-38.

## 7. Frontend implementation

Implement a focused login experience and wire it into the existing app. Do not redesign the entire authentication UI; broad responsive auth polish belongs to JMP-40.

- Add a `/login` route and a `LoginPage` using the existing public layout and styling conventions.
- Add login RTK Query mutation and shared contract types in `auth-api.ts`.
- Set `credentials: 'include'` on login and any relevant base-query configuration so the browser accepts the refresh cookie. Keep CORS credential behavior aligned with the API allowlist.
- Store the short-lived access token in application memory (for example, a small Redux auth slice). Do not persist it or the refresh credential in `localStorage`, `sessionStorage`, IndexedDB, or other script-readable persistent storage.
- Attach `Authorization: Bearer <access token>` to API requests through the existing `baseApi` `prepareHeaders` pattern. Avoid a circular import between the store, slice, and base API.
- On successful login, update in-memory auth state and navigate to `/app`.
- On failure, show a generic “Invalid email or password” message for authentication failures; show a separate rate-limit message only for the generic 429 response. Do not tell the user that an email is registered or unverified.
- Update the “Sign in available soon” placeholder on the registration success/registration page to a working `/login` link where appropriate.
- Add a client-side route guard to the existing `/app` authenticated layout if needed for the acceptance flow. Be explicit in code/comments that this is UX routing only, not server authorization. Server-side route authorization belongs to JMP-38.
- Since access tokens are memory-only and JMP-36 refresh is not implemented yet, a browser reload may require the user to sign in again for this interim increment. Do not implement automatic refresh here.
- Never display or log the refresh cookie value. Do not add a logout flow in this issue.

## 8. Environment configuration

Extend the existing centralized `loadEnv` schema and `.env.example` files using the repo's established style. Suggested variables (confirm naming conventions before implementing):

```env
AUTH_ACCESS_TOKEN_SECRET=<random-secret-generated-locally>
AUTH_ACCESS_TOKEN_TTL_SECONDS=900
AUTH_REFRESH_TOKEN_TTL_DAYS=30
AUTH_REFRESH_COOKIE_SAME_SITE=lax
AUTH_LOGIN_RATE_LIMIT_IP_MAX=10
AUTH_LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS=900
AUTH_LOGIN_RATE_LIMIT_EMAIL_MAX=5
AUTH_LOGIN_RATE_LIMIT_EMAIL_WINDOW_SECONDS=900
```

Requirements:

- Validate types, ranges, and security-sensitive combinations at startup.
- `AUTH_ACCESS_TOKEN_SECRET` must be sufficiently long/high entropy; never include its value in validation errors or logs.
- Do not commit real secrets. Keep `.env` ignored and update only example files with placeholders.
- If `SameSite=None` is allowed, require `Secure=true` and HTTPS in production.
- Ensure all new fields are passed from `server.ts` through `createApp`/`IdentityRouterOptions` into the login composition root. Preserve the project's pure `createApp()` testability; do not make it read `process.env` directly.

## 9. Tests — required

Use the existing Vitest, Supertest, injected fake repositories/hasher/clock/token issuer, and PostgreSQL integration-test patterns. Never send real emails or use real time in unit tests.

### Contracts and validation

- Valid login payload accepted; email normalization correct.
- Missing/malformed email, missing/too-short/too-long password and unknown properties rejected.

### Login use case and credentials

- Correct password for an active, verified user succeeds.
- Unknown user and incorrect password return indistinguishable public failures.
- Unverified user is rejected even when the password is correct.
- INACTIVE, SUSPENDED, and DELETED users are rejected.
- Authentication failure creates no session and issues no tokens/cookie.
- Password hashes never appear in responses or logs.

### Tokens and session persistence

- Access token signature, algorithm, issuer, audience, `sub`, `sid`, `iat`, `exp`, and configured TTL are correct.
- Access token expires within the configured short lifetime.
- Refresh credential is generated with cryptographically secure randomness and only its hash is persisted.
- Session references the correct user and token family, starts with `parentSessionId: null` and `revokedAt: null`, and has the configured expiry.
- Raw refresh credential is not returned in JSON or logs.
- Session persistence failure produces no successful login response/cookie.

### Cookie, rate limiting, and API

- Cookie is HttpOnly; Secure is true in production and false only in local development/test; SameSite and Path are correct; Domain is not set.
- Cross-origin login request supports `credentials: 'include'` and the configured CORS allowlist.
- IP and normalized identifier limits work, include `Retry-After`, and are deterministic with an injected clock.
- Unknown and known emails are treated consistently by login rate limiting and error responses.
- API returns standard success envelope and Problem Details errors.
- Request logs redact password, email, cookie, Authorization, and tokens as applicable.

### Frontend and regression

- Login form validation, pending state, success navigation, generic error, and rate-limit state.
- Access token remains in memory only and is attached as a Bearer token to subsequent API calls.
- Refresh cookie is not read by JavaScript or persisted by frontend code.
- `/app` UX guard redirects when no in-memory access token exists; document that the guard is not a security boundary.
- Existing JMP-33 registration and JMP-34 email verification/resend tests continue to pass.

Add a PostgreSQL-backed integration test for session creation and stored refresh-token hash if the existing test infrastructure supports it. Verify the committed migration contains `user_sessions`; add no migration when the schema and migration already support this task.

## 10. Quality gates

Inspect package scripts and run the full repository checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check
pnpm --filter @jmp/contracts run build
pnpm --filter @jmp/api run build
pnpm --filter @jmp/web run build
pnpm run workspace:check
```

Run relevant PostgreSQL integration tests with the documented test database setup. Do not claim a command passed unless it actually ran successfully. Fix failures; if blocked by infrastructure, report the exact blocker and distinguish it from a code failure.

## 11. Explicitly out of scope

- Refresh-token rotation, refresh endpoint, replay detection, token-family revocation, logout, session listing, and session revocation — JMP-36.
- Password reset — JMP-37.
- Server-side role/permission middleware and role assignment — JMP-38.
- User profile update — JMP-39.
- Full responsive auth redesign — JMP-40.
- Candidate or employer profile creation.
- OAuth/social login, MFA, CAPTCHA, account lockout redesign, device management, or a general notification system.
- Production Redis deployment. Record the in-memory login limiter limitation and Redis follow-up for a future infrastructure task.

Do not treat the client-side `/app` guard as sufficient backend authorization.

## 12. Git and delivery

- Create a dedicated branch from the latest `origin/master`, for example `JMP-35-Login-and-establish-a-secure-session`.
- Preserve unrelated user changes. Do not use destructive reset/clean commands.
- Do not commit `.env`, API keys, generated secrets, raw tokens, or other credentials.
- Do not rewrite shared history or force-push.
- Commit and push the implementation branch, then open a PR into `master`.
- Do not merge the PR unless explicitly instructed.

## 13. Required implementation handoff

Report:

1. Branch name and exact base commit.
2. Commit hash(es) and PR URL.
3. Files created/modified.
4. Whether any migration was needed and evidence that `user_sessions` exists.
5. Login request/response contract and generic error semantics.
6. Access-token algorithm, claims, TTL, key configuration, and safe key-generation instructions (never reveal a real key).
7. Refresh-token generation/hash persistence, session model fields, cookie attributes, and TTL.
8. Login rate-limit defaults, behavior, configuration, and multi-instance limitation.
9. Frontend route, in-memory token storage, Bearer header behavior, and reload limitation pending JMP-36.
10. Test counts/results, PostgreSQL integration results, and each quality-gate result.
11. Environment variable names required locally and in production.
12. Known risks, deployment assumptions, and any deferred items.

Update JMP-35 in Jira with the implementation summary and PR link when available. Keep it In Progress until the PR is merged and required CI checks pass.

## 14. Execution sequence

1. Inspect repository and current branch state; confirm the base.
2. Present plan and files expected to change.
3. Implement contracts, access-token/session ports and use case, persistence, login route, rate limiter, environment wiring, and tests.
4. Implement the login page, RTK Query mutation, in-memory auth state, and UX route guard.
5. Run complete quality gates and PostgreSQL integration tests; fix failures.
6. Commit/push the branch and open a PR without merging it.
7. Provide the full handoff report and update Jira with the PR link.
