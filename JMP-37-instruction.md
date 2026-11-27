# JMP-37 — Reset a Forgotten Password

## 1. Task and baseline

**Jira:** https://hailemariamaddisu21.atlassian.net/browse/JMP-37  
**Repository:** `haile-12-21-23/Job-Marketplace`  
**Base branch:** `master`  
**Required base commit:** `bf7c975d8e7b991c59b463580e6deaff3bcd78e2` (merged JMP-36 / PR #17)  
**Suggested branch:** `JMP-37-Reset-a-forgotten-password`

Jira acceptance criteria:

- Request response does not reveal whether an email exists.
- Reset token is single-use and expires.
- Password policy is validated.
- Successful reset revokes existing sessions.
- Token misuse and reset flow are tested.

Do not transition JMP-37 to Done until its PR is merged and final required CI passes. Do not start/close Sprint 2 as part of this task; its Jira lifecycle is managed separately.

## 2. First inspect the current codebase

Before editing:

1. Confirm the working tree and current `master` HEAD. Do not discard or overwrite user changes. Fetch and fast-forward `master` only when safe; otherwise stop and report the divergence.
2. Confirm the branch is based on the merged commit above (or a newer `master` containing it).
3. Inspect the current Prisma schema and migration history. `PasswordResetToken` already exists in `apps/api/prisma/schema.prisma` with `id`, `userId`, unique `tokenHash`, `expiresAt`, `usedAt`, `createdAt`, a relation to `User`, and an index on `userId`. `User.resetTokens` also already exists. Reuse these; do not create a duplicate table/model or migration unless the current branch proves the schema/migration is missing something essential.
4. Review the existing verification token flow, `CryptoVerificationTokenService`, `EmailSender` / `HttpEmailSender`, `ResendRateLimiter`, `SlidingWindowCounter`, `PrismaSessionRepository`, and the existing login/password schemas and UI.
5. Preserve the current modular-monolith boundaries, typed Zod contracts, repository ports, use cases, controller/routes, RTK Query, and UI conventions.

## 3. API and contract design

Add strict shared Zod request/response contracts in a focused auth contracts file, exported through the existing auth barrel and `@jmp/contracts` root barrel. Suggested names (follow current naming conventions consistently):

- `requestPasswordResetRequestSchema`: `{ email }`, trimmed/validated email, max 255, `.strict()`.
- `requestPasswordResetResponseDataSchema` and envelope: `{ accepted: true, message }`.
- `confirmPasswordResetRequestSchema`: `{ token, newPassword }`, `.strict()`. Token must be a non-empty bounded string. New password must follow the same policy as registration/login currently use (8–100 characters); factor a shared policy schema only if it can be done without changing existing behavior unexpectedly.
- `confirmPasswordResetResponseDataSchema` and envelope: `{ reset: true, message }`.

Suggested endpoints:

- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

The request endpoint should return HTTP 202 with the exact same success envelope/message for all valid email requests, whether the address is unknown, inactive, unverified, or eligible. It must not disclose account existence in response fields, status, or error wording. Only active, email-verified users should receive reset messages. If email delivery fails, log a sanitized failure and still return the same generic accepted response.

Suggested generic request message: `If an account matches that email address, password reset instructions will be sent.` Keep this wording identical for every valid request.

The confirmation endpoint should return a generic 400 Problem Details response for missing/unknown/expired/already-used tokens, for example code `INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN` and detail `This password reset link is invalid or has expired. Request a new link.` Do not disclose whether the account exists or whether a token was previously consumed. Validation errors for malformed request bodies may remain 422.

Set `Cache-Control: no-store` and `Pragma: no-cache` on both endpoints. These endpoints are not cookie-authenticated; do not add the refresh/logout Origin guard indiscriminately. Do not include any token/hash in success or error JSON.

## 4. Token issuance and email delivery

Use a high-entropy cryptographically secure random opaque token (32 random bytes, base64url, consistent with the verification/refresh token primitives). Persist only its SHA-256 hash in `password_reset_tokens`; never persist the raw token. Never log the raw token, hash, or full reset URL.

- Add a `PasswordResetTokenRepository` port and Prisma implementation; keep persistence details out of use cases.
- Issue a configurable token lifetime, default **30 minutes**, with bounded environment validation (suggest 5–1440 minutes). Add `PASSWORD_RESET_TOKEN_TTL_MINUTES` to `ApiConfig`, `loadEnv`, tests, and `apps/api/.env.example`.
- At issuance, serialize per-user token issuance by locking the user row (`SELECT ... FOR UPDATE`), mark previous unused reset tokens for that user used, then insert the new hashed token with its expiry. This prevents multiple active reset links being issued concurrently.
- Build the frontend link using the configured `APP_WEB_URL` and `/reset-password?token=<raw-token>`; use URL APIs/encoding rather than string concatenation that can corrupt query parameters.
- Extend the existing provider-agnostic email sender with a password-reset message operation (or a well-structured generic transactional-email operation). Reuse the existing `HttpEmailSender` HTTP endpoint, Bearer key, sender address, timeout, and production configuration; do not add Nodemailer or a second email-provider integration.
- Add plain-text and HTML reset email content with escaped user-controlled values, a clear expiry, a single-use explanation, and a notice to ignore the email if it was not requested.
- Development/test email adapter must not make outbound calls and must not log reset URLs or tokens. Production provider errors must be sanitized; do not leak provider response bodies, tokens, or secrets.
- Add email sender tests and update all test fakes/mocks implementing the current `EmailSender` interface.

## 5. Request use case and anti-enumeration/rate limiting

Add a request-reset use case that:

1. Normalizes the email using the existing `normalizeEmail` helper.
2. Looks up the user through the safe user repository projection.
3. If there is no user, or the account is not `ACTIVE` and email-verified, performs no token issuance or mail delivery and returns the same generic accepted result.
4. For an eligible user, generates a raw token, hashes it, persists/supersedes tokens, constructs the reset URL, and asks the email sender to deliver it.
5. Sanitizes delivery failure logs and returns the same generic accepted result even if provider delivery fails.

Add a dedicated password-reset rate limiter or a carefully generalized reusable limiter. Enforce both IP and normalized-email-identifier limits. Hash the normalized email identifier (e.g. SHA-256) before using it as an in-memory limiter key; do not retain raw email values as limiter keys. Suggested defaults: IP 10 requests / 900 seconds, email 3 requests / 900 seconds, configurable via:

- `PASSWORD_RESET_RATE_LIMIT_IP_MAX`
- `PASSWORD_RESET_RATE_LIMIT_IP_WINDOW_SECONDS`
- `PASSWORD_RESET_RATE_LIMIT_EMAIL_MAX`
- `PASSWORD_RESET_RATE_LIMIT_EMAIL_WINDOW_SECONDS`

Return 429 with `Retry-After` when throttled. This response is about throttling, not account existence. Follow current `TRUST_PROXY` handling for client IP. Document that the in-memory limiter is single-process and Redis remains a future horizontal-scaling concern; do not expand this story into a Redis migration.

## 6. Atomic token consumption, password update, and session revocation

Add a confirmation use case and make the core reset operation one PostgreSQL transaction. Hash the submitted password using the existing `PasswordHasher`; never store plaintext.

The repository operation should atomically:

1. Find the candidate token's `userId` from its hash. This initial lookup can be non-locking solely to establish the user ID.
2. Lock the user row first with `SELECT ... FOR UPDATE`.
3. Lock/re-read the matching `PasswordResetToken` row with `SELECT ... FOR UPDATE` (always use the same user-then-token lock order in issuance and consumption to avoid deadlocks).
4. Validate that the token exists, belongs to that user, is unused, and `expiresAt > now`; also require the user to remain eligible (`ACTIVE` and email-verified).
5. Conditionally mark the token used exactly once, update `users.password_hash`, and revoke every active `user_sessions` row for that user (`revoked_at IS NULL`) before committing.
6. Return a generic success/failure outcome. Any failure must roll back all changes. Two concurrent attempts to consume the same token must not both succeed.

**Session race protection is important:** a password reset must not be followed by a successful refresh that began before the reset and creates a live descendant after the reset's all-session update. Coordinate with the per-family advisory lock introduced in JMP-36. Review and, where needed, update `PrismaSessionRepository` so session mutation paths acquire the owning user row's shared lock (`FOR SHARE`) before taking session row locks/mutating rows. Resolve `userId` after obtaining the family advisory lock but before locking the session row. The reset transaction's user `FOR UPDATE` lock must serialize against these operations: either the refresh finishes first and reset revokes its child, or reset commits first and refresh sees the session revoked and fails. Keep the lock order consistent and test it against real PostgreSQL.

Also inspect the login session-creation path. A login can verify a password just before reset and try to create a session just after it. Ensure session creation cannot mint a post-reset session using a stale pre-reset password verification: serialize creation against the user row and revalidate that the current stored password hash still matches the credential snapshot used for login (or implement an equally robust design). Map a stale-credential outcome to the existing generic invalid-credentials response. Do not expose hash material.

Do not revoke sessions outside the transaction and do not limit revocation to one token family: the acceptance criterion requires revoking all active sessions for that user across all devices/families.

## 7. Frontend flow

Add public routes and pages:

- `/forgot-password`: email form, request mutation, accessible loading/error/success states. The success message must use the same generic copy regardless of account existence.
- `/reset-password`: read the `token` query parameter, capture it in component memory, immediately remove it from the browser URL using the router's replace navigation/search-param API, and set `Referrer-Policy: no-referrer` (follow the existing verification page's lifecycle-safe meta pattern or a stronger HTTP header if available).
- Reset form collects a new password and confirmation. Confirmation is client-side only and must match; only `token` and `newPassword` go to the API. Follow the existing 8–100 character password policy and provide clear validation.
- On success, clear the password/token component state and link to `/login`; do not auto-login or return auth/session credentials from password reset.
- Invalid/expired/used token state should offer a link back to `/forgot-password` to request a new link.
- Add a `Forgot password?` link to the existing login page.
- Add RTK Query request/confirm mutations with the typed shared contracts.
- Never place reset tokens in localStorage, sessionStorage, IndexedDB, Redux, analytics, logs, or API response bodies. Avoid leaking the token through referrer headers; strip it promptly from the URL.

## 8. Security and correctness constraints

- Only store SHA-256 token hashes; raw reset token exists only transiently for the email URL.
- Token must be cryptographically random, single-use, bounded lifetime, and invalidated when a newer reset request is issued.
- Responses must not enumerate registered addresses.
- Apply IP and hashed-email throttling.
- Do not log credentials, password reset token, token hash, or full reset URL. Review Pino redaction for the new body fields (e.g. reset token and `newPassword`) in addition to current password/cookie/authorization redaction.
- Use constant generic invalid-token semantics for unknown, expired, used, and ineligible cases.
- Hash password using existing bcrypt adapter and existing password policy. Do not invent a new policy silently; check bcrypt input byte constraints and keep contract behavior consistent.
- Reset transaction updates user password, consumes token, and revokes all sessions atomically.
- Keep access/refresh secrets out of all DTOs and logs.
- Reset URLs are frontend links, not API tokens in query strings sent to API. UI captures and removes token before doing the confirm request.
- Do not alter registration/login/refresh response contracts unnecessarily.

## 9. Required test coverage

### Contracts

- Valid request and confirm shapes.
- Reject malformed email, empty/oversized token, weak/too-long password, and unexpected object fields.
- Response envelopes match their DTOs.

### Request flow and anti-enumeration

- Unknown email, inactive user, unverified user, and eligible user all receive identical HTTP status and exact public response body.
- Only eligible users receive email.
- Verify only token hash is persisted; raw token appears only in the captured email URL.
- Previous unused token is invalidated when a new token is issued.
- Email provider failure still gives the identical generic accepted response; logs contain no token/URL/secret.
- Rate-limit IP and hashed normalized email independently and assert `Retry-After`.

### Confirmation and persistence

- Valid token changes password hash and marks token used.
- Password is hashed and never returned/stored plaintext.
- Unknown, malformed, expired, used, and superseded tokens fail with the same generic reset-token outcome.
- A second use fails.
- Two concurrent consumes of the same token yield exactly one success.
- User's every active session across multiple token families is revoked; unrelated user's sessions remain unchanged.
- Transaction rollback: force a failure during password/session mutation and prove token consumption, password update, and session revocation all roll back.
- Real PostgreSQL integration tests for issuance/consumption locks and atomicity; do not rely only on in-memory repository mocks.

### Session concurrency

- Race password reset against refresh rotation for an existing session. After both complete, no active session for that user may remain and no stale access/refresh session may be minted after reset.
- Race password reset against login session creation using the old password; no session may remain/appear after the reset succeeds based on stale credentials.
- Keep regression coverage for JMP-36 family-level advisory-lock rotation/replay/logout behavior.

### Frontend

- Forgot-password generic success regardless of server account lookup (frontend sees only generic response).
- Reset token is captured then removed from URL before mutation; no storage persistence.
- Password confirmation mismatch blocks submission; valid form sends only token + new password.
- Loading, expired/invalid token, transient server error, and success/login-navigation states.
- Login page exposes the forgot-password link and router tests cover both routes.

Run the full workspace checks after the final edit: Prettier on maintained source/docs, `pnpm run lint`, `pnpm run typecheck`, `pnpm check`, PostgreSQL integration tests, package production builds, and `pnpm run workspace:check`. Report exact commands, test counts, DB test evidence, and any pre-existing unrelated failures honestly.

## 10. Files likely involved (adapt to existing names)

- `packages/contracts/src/auth/*` and auth/root barrel exports.
- `apps/api/src/modules/identity/ports/password-reset-token.repository.ts` (new port).
- `apps/api/src/modules/identity/infrastructure/prisma-password-reset-token.repository.ts` (new adapter).
- `apps/api/src/modules/identity/application/request-password-reset.use-case.ts` (new use case).
- `apps/api/src/modules/identity/application/confirm-password-reset.use-case.ts` (new use case).
- `apps/api/src/modules/identity/ports/email-sender.ts` and `apps/api/src/modules/identity/infrastructure/email-sender.ts` (reset email support).
- `apps/api/src/modules/identity/infrastructure/password-reset-rate-limiter.ts` or generalized limiter.
- `apps/api/src/modules/identity/identity.controller.ts`, `identity.routes.ts`, and module exports.
- `apps/api/src/config/env.ts`, config tests, `apps/api/.env.example`.
- Pino redaction in `apps/api/src/app.ts`.
- Existing session repository/login use case if needed for atomic reset vs refresh/login serialization.
- `apps/web/src/services/auth-api.ts`, router, `LoginPage.tsx`, plus new forgot/reset pages and tests.

Prefer focused files and small cohesive changes. No schema migration is expected because the reset token model already exists.

## 11. Completion handoff

When implementation is complete, provide:

1. Branch, base SHA, final commit SHA, and PR URL (open/unmerged against `master`).
2. List of files created/modified and explicit migration decision.
3. Endpoint contracts, status/error semantics, TTL/rate-limit environment variables, and email delivery behavior.
4. Explanation of the single-use transaction and all-session revocation lock order, including how concurrent refresh/login issuance is handled.
5. Evidence that raw tokens are not stored/logged/returned and URL leakage is mitigated.
6. Exact test counts, PostgreSQL integration results, lint/typecheck/format/build/workspace results, and GitHub Actions CI link/result.
7. Known limitations and any production environment variables requiring configuration.

Do not claim the Jira issue is Done. Leave JMP-37 In Progress until merge and final CI verification.
