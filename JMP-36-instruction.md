# JMP-36 — Refresh and Revoke Authentication Sessions

## 1. Task context

**Jira:** https://hailemariamaddisu21.atlassian.net/browse/JMP-36  
**Repository:** `haile-12-21-23/Job-Marketplace`  
**Base branch:** `master`  
**Required base commit:** `7e1e888021bcb32850c5bbb77d54cdc7f0d902e2` (merged JMP-35 / PR #16)  
**Suggested branch:** `JMP-36-Refresh-and-revoke-authentication-sessions`

JMP-35 introduced login, short-lived HS256 access JWTs, opaque refresh credentials, and persisted `UserSession` rows. Access tokens are held in Redux memory only. Consequently, a browser reload loses the access token even though the HttpOnly refresh cookie remains. JMP-36 must implement safe refresh rotation and logout, and restore the in-memory access token when the web app starts.

Work only on JMP-36. Do not implement password reset (JMP-37), platform role/permission middleware (JMP-38), or a Redis migration for the existing login/resend in-memory rate limiters.

## 2. Existing implementation facts — inspect before changing

The merged `master` baseline already contains:

- `apps/api/src/modules/identity/ports/session.repository.ts`
- `apps/api/src/modules/identity/infrastructure/prisma-session.repository.ts`
- `apps/api/src/modules/identity/domain/refresh-token.ts`
- `apps/api/src/modules/identity/domain/access-token.ts`
- `apps/api/src/modules/identity/application/login.use-case.ts`
- `apps/api/src/modules/identity/identity.controller.ts`
- `apps/api/src/modules/identity/identity.routes.ts`
- `apps/api/src/config/env.ts`
- `apps/web/src/services/auth-api.ts`
- `apps/web/src/app/auth-slice.ts`
- `apps/web/src/components/auth/RequireAuthGuard.tsx`
- `apps/web/src/layouts/AuthenticatedLayout.tsx`

The Prisma `UserSession` model already has these fields and relations:

```prisma
model UserSession {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @map("user_id") @db.Uuid
  tokenFamilyId    String    @map("token_family_id") @db.Uuid
  refreshTokenHash String    @unique @map("refresh_token_hash") @db.VarChar(255)
  parentSessionId  String?   @map("parent_session_id") @db.Uuid
  expiresAt        DateTime  @map("expires_at") @db.Timestamptz(6)
  revokedAt        DateTime? @map("revoked_at") @db.Timestamptz(6)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  parentSession UserSession?  @relation("SessionChain", fields: [parentSessionId], references: [id], onDelete: SetNull)
  childSessions UserSession[] @relation("SessionChain")

  @@index([userId])
  @@index([tokenFamilyId])
  @@map("user_sessions")
}
```

The login flow already generates a 32-byte random base64url refresh credential and stores only its SHA-256 hex digest. It creates a token family with `parentSessionId: null`, and an expiry based on `AUTH_REFRESH_TOKEN_TTL_DAYS` (default 30 days). `AccessTokenService.sign()` accepts `{ userId, sessionId, now }`; the signed JWT contains `sid`.

The current `SessionRepository` only supports `create()`. Extend its port and Prisma implementation rather than introducing another session repository or table. Existing cookie configuration is built by `buildRefreshCookieSpec()` in `domain/refresh-token.ts`:

- Production name: `__Secure-jmp_refresh`; non-production name: `jmp_refresh`
- `HttpOnly: true`
- `Secure: true` in production
- configurable SameSite (`lax` default; `strict` or `none` supported with existing validation)
- exact path `/api/v1/auth`
- host-only cookie (no `Domain`)

`apps/api/src/app.ts` configures credentialed CORS with `CORS_ORIGINS`, but CORS alone is not CSRF protection. The app currently does not install `cookie-parser`; inspect dependency availability before choosing a robust cookie parsing approach. Do not assume `req.cookies` exists.

## 3. Required API behavior

Implement these endpoints under the existing identity router:

### `POST /api/v1/auth/refresh`

1. Require and parse the configured refresh cookie. Never accept a refresh token from JSON, query parameters, or Authorization headers.
2. Hash the presented raw token with the existing `RefreshTokenService.hashToken()` and look up the matching session.
3. Validate that the session and its user are eligible: session exists, is not expired, is not revoked, and the user is still `ACTIVE` and email-verified (`emailVerifiedAt !== null`). Do not mint access tokens for suspended, inactive, deleted, or unverified accounts.
4. Generate a fresh opaque refresh credential (32 random bytes, base64url); persist only its SHA-256 hash.
5. Rotate the refresh token atomically:
   - Lock the presented session row in PostgreSQL (`SELECT ... FOR UPDATE`, using parameterized Prisma raw SQL or an equivalent safe approach).
   - In the same database transaction, mark the presented/parent session as consumed by setting `revokedAt`, then insert a child session with the same `userId` and `tokenFamilyId`, `parentSessionId` set to the consumed session ID, the new hash, and the appropriate expiry.
   - A single presented token must never create multiple child sessions.
   - Do not perform the parent update and child insert as separate transactions.
6. Sign the access JWT for the new child session ID (`sid`). Return the same safe response shape as login (`accessToken`, `tokenType`, `expiresIn`, and safe user fields). Set the new raw refresh credential only in the configured HttpOnly cookie. Never include it in JSON, logs, errors, telemetry, or test snapshots.
7. Set `Cache-Control: no-store` and `Pragma: no-cache` on refresh responses.
8. Return generic authentication failure semantics for missing, unknown, expired, revoked, or otherwise invalid refresh credentials. Do not reveal whether a token hash exists or whether a session was expired/revoked.

### `POST /api/v1/auth/logout`

1. Read the refresh credential only from the configured cookie.
2. Revoke the current device's token family (all still-active rows with that `tokenFamilyId`) in a database transaction. Do not revoke other token families belonging to the same user, because those represent other signed-in devices/sessions.
3. Make logout idempotent: missing, unknown, expired, or already-revoked cookies must not reveal session existence. Clear the cookie in all normal logout outcomes.
4. Clear the cookie using the same name and matching path, host-only, Secure, HttpOnly, and SameSite attributes used when setting it. Do not accidentally clear a cookie on `/` while the original cookie path is `/api/v1/auth`.
5. Return a small success response such as `{ data: { loggedOut: true } }`, with `Cache-Control: no-store` and `Pragma: no-cache`. Do not return session identifiers or refresh credentials.

## 4. Rotation, expiry, and replay policy

Use the existing self-referential session chain. Avoid a new table or redundant schema fields unless a concrete implementation gap is demonstrated.

### Expiry policy

Use a fixed absolute lifetime for a token family in this task: each child session inherits the parent session's original `expiresAt`. Do not extend the family's lifetime each time a token is rotated. This retains the configured maximum lifetime from initial login and avoids indefinitely renewable sessions without adding schema state. If implementation review identifies a compelling requirement for a sliding expiry, document it and add an explicit absolute-family-expiry design rather than silently extending expiry on every rotation.

### Replay detection

A previously rotated session remains in `user_sessions` with its old hash and `revokedAt` populated. Its child is discoverable through `parentSessionId` / `childSessions`.

When a presented token matches a session that is already revoked because it has a child (meaning the credential was consumed by rotation):

- Treat it as refresh-token reuse/replay.
- In the same transaction, revoke every still-active session row in that `tokenFamilyId` by setting `revokedAt`.
- Do not revoke any other token family for the same user.
- Return the same generic authentication failure used for other invalid refresh credentials.

When a token hash is unknown, there is no trustworthy family ID to revoke; return generic authentication failure without changing unrelated sessions.

For a session revoked by logout (no child created), return generic authentication failure; it is not necessary to revoke unrelated sessions or other device families.

### Concurrency requirements

This must be race-safe at the PostgreSQL level, not merely guarded in JavaScript. Two simultaneous uses of one refresh credential must not both rotate successfully. The transaction should lock the current session row before inspecting its revoked/child state. A second request waiting on that lock must see the committed rotation and trigger family revocation as replay. Add a real PostgreSQL integration test for this behavior. It is an intentional security trade-off that a duplicate retry can invalidate the family; coordinate frontend refreshes to prevent avoidable duplicate requests.

### Access-token signing order

Do not commit a rotation and then discover that JWT signing cannot succeed, leaving the browser with a consumed cookie and no replacement. Prefer generating the candidate child session ID and new raw refresh token first, obtaining the user identity, signing the short-lived access token for that candidate session ID, then asking the repository to atomically validate/rotate the current session. Only return either new credential if the transaction reports that rotation succeeded. The repository must re-check the session and current user status inside the transaction; a pre-read alone is not authoritative. An unused signed JWT generated before a failed transaction must never be returned.

## 5. CSRF and origin protection — mandatory

Both refresh and logout authenticate through an automatically attached cookie. Protect both endpoints with dedicated origin-validation middleware; do not rely on CORS or SameSite alone.

- Require an `Origin` header for these browser cookie-authenticated POST endpoints.
- Reject missing Origin, `Origin: null`, malformed values, and origins not exactly present in configured `CORS_ORIGINS`.
- Compare canonical URL origins exactly; do not use substring, suffix, wildcard, or loose hostname matching.
- Optionally reject `Sec-Fetch-Site: cross-site` as an additional defense, but Origin allowlist validation is required even if Fetch Metadata is present.
- Place the middleware before the refresh/logout controller handlers.
- Keep the existing CORS allowlist and `credentials: true`; never introduce wildcard credentialed CORS.
- Write tests for allowed origin, missing origin, null origin, malformed origin, untrusted origin, and cross-site Fetch Metadata when that check is implemented.

The normal CORS middleware currently permits requests without an Origin for CLI/server use. That behavior may remain globally unchanged; the refresh/logout route-specific CSRF middleware must still require Origin.

## 6. Cookie handling and response safety

- Keep the existing cookie name, host-only behavior, `HttpOnly`, Secure, SameSite, and `/api/v1/auth` path.
- Ensure cookie parsing handles the exact configured cookie name and does not accidentally accept similarly named cookies. Use a properly declared direct dependency if using a parsing library; do not rely on undeclared transitive packages. A small, well-tested parser for this base64url-only value is acceptable if it safely handles whitespace, duplicate cookie names, and malformed headers.
- Reject duplicate instances of the refresh-cookie name rather than choosing an ambiguous value.
- Cookie clearing must use the same cookie path and security attributes. Omit `maxAge` on clear if required by Express semantics.
- Refresh and logout must never log raw cookies or tokens. Existing Pino redaction already covers the Cookie header; preserve it.
- Refresh responses and logout responses must be non-cacheable (`Cache-Control: no-store`, `Pragma: no-cache`).
- Do not alter login cookie behavior unless a shared helper is needed and regression tests remain green.

## 7. Frontend behavior

Extend the existing RTK Query authentication API and Redux auth flow. Preserve the established invariant that access tokens are memory-only and refresh tokens remain HttpOnly cookies.

### Refresh endpoint client

- Add a `refresh` mutation for `POST /auth/refresh` with `credentials: 'include'`.
- Add a `logout` mutation for `POST /auth/logout` with `credentials: 'include'`.
- Reuse the existing typed login/auth response contract where appropriate; add explicit shared Zod contracts for new response data if that follows current package conventions.
- Do not create a client-visible refresh-token field or persist access/refresh tokens in localStorage, sessionStorage, IndexedDB, or document.cookie.

### App bootstrap / route guard

- On a full page reload, Redux begins without an access token. Before redirecting a protected `/app` route to `/login`, attempt one refresh using the HttpOnly cookie.
- Add a clear bootstrap state (for example `idle | refreshing | authenticated | unauthenticated`) so the route guard can show a minimal loading state while refresh is pending and does not flicker to `/login` prematurely.
- On refresh success, dispatch the existing auth-session action using the returned access token, TTL, and safe user projection. The existing absolute `expiresAt` handling/middleware must remain intact.
- On expected authentication failure, clear auth state and redirect to `/login`.
- On transient network/server failure, avoid an infinite refresh loop; handle the failure deliberately and keep the UI from exposing a protected page without a valid access token.
- Ensure a page load or several React components do not issue duplicate refresh requests. Use a shared in-flight promise/single-flight mechanism. Where supported, use a browser cross-tab coordination mechanism such as the Web Locks API around refresh so multiple tabs do not accidentally replay the same cookie. Provide a safe fallback and document its limitation if Web Locks are unavailable.
- A successful refresh rotates the browser cookie via `Set-Cookie`; JavaScript must never read it.

### Logout UI/state

- Integrate logout with the existing authenticated layout/navigation using the project's current UI patterns; do not redesign the application shell.
- On logout, call the server endpoint with credentials included and clear the in-memory auth state. If the network/server call fails, clear local access-token state but do not falsely claim the server session was revoked; surface a clear retry/error message or otherwise make the failure visible.
- After a confirmed logout, navigate to `/login` and ensure protected routes no longer render.

### Important access-token limitation

JMP-35's JWT includes `sid`, but the project does not yet have the full server authentication/authorization middleware planned for JMP-38. Revoking the refresh session prevents future refreshes immediately. Do not claim that logout instantly invalidates an already-issued access JWT unless the request authentication layer is also changed to check that `sid` is still active. Keep access JWTs short-lived and document that immediate bearer-token revocation will be enforced when session-aware authorization middleware is implemented in JMP-38 (or explicitly expand JMP-36 only if the repository already has the required middleware).

## 8. Suggested code structure

Follow existing application/domain/ports/infrastructure/controller/router separation. Suggested additions (adapt names to repository conventions):

- `application/refresh-session.use-case.ts`
- `application/logout-session.use-case.ts`
- Extend `ports/session.repository.ts` with typed read/rotate/revoke outcomes.
- Extend `infrastructure/prisma-session.repository.ts` with parameterized, transaction-safe operations.
- Extend `identity.controller.ts` with `refresh` and `logout` handlers.
- Extend `identity.routes.ts` and `IdentityRouterOptions` for dependency injection and allowed origins.
- Add route-specific origin guard middleware, preferably under `apps/api/src/middleware/` or identity module if it is specific to identity.
- Extend `apps/web/src/services/auth-api.ts`, `auth-slice.ts` if needed, `RequireAuthGuard.tsx` or a focused auth bootstrap component, and the existing authenticated layout.
- Update `apps/api/src/modules/identity/index.ts` exports and `.env.example` only if new environment variables are truly needed.

Avoid coupling the repository port to Express request/response objects. Keep cookie concerns in the controller/domain cookie helpers, and transaction/replay decisions in the application/repository boundary.

## 9. Tests and quality gates

Add focused tests at each layer.

### Domain / application tests

- Refresh-token generation remains cryptographically random and hash-only persistence is preserved.
- Valid refresh rotates hash and returns a new access JWT bound to the new session ID.
- Unknown/missing token returns generic authentication failure.
- Expired, revoked, and user-ineligible sessions cannot mint access tokens.
- Reuse of a consumed parent revokes all active rows in only that token family.
- Logout revokes the current family and is idempotent.
- Access-token signing failure does not consume/rotate the current token.
- No response shape contains raw refresh credentials.

### Repository / PostgreSQL integration tests

Use the real PostgreSQL test setup already used by the API integration tests.

- Create root session, rotate to child, verify parent `revokedAt`, child `parentSessionId`, same `tokenFamilyId`, and hash uniqueness.
- Verify child retains the root's fixed `expiresAt`.
- Reuse parent hash and verify all still-active rows in that family become revoked.
- Verify unrelated token families for the same user remain active.
- Verify logout revokes only the matching family.
- Run two concurrent rotations using the same token and assert at most one rotation succeeds and the replay path revokes the family. Test the actual PostgreSQL row-lock implementation, not only a mocked repository.
- Verify expired and revoked sessions cannot rotate.

### API route tests

- Successful refresh sets a new cookie with the correct name, HttpOnly, Secure behavior, SameSite, Path, and no Domain; response JSON contains only access token/session-safe user data.
- Missing/invalid/expired/replayed token yields generic failure and does not leak session state.
- Logout returns idempotent success for missing/invalid cookies and clears the cookie with the exact matching path/security attributes.
- Both endpoints set no-store response headers.
- Origin allowlist cases and `Sec-Fetch-Site` defense are covered.
- Preserve all existing register, verify-email, resend, and login route tests.

### Frontend tests

- Refresh is attempted once during protected-route bootstrap after a reload.
- Guard waits during refresh and does not prematurely redirect.
- Successful refresh hydrates in-memory auth and respects absolute access-token expiry.
- Failed refresh clears auth and routes to login.
- Multiple consumers share one in-flight refresh; Web Locks behavior/fallback is tested where practical.
- Logout calls the API, clears memory state, navigates to login on success, and surfaces server/network failure without claiming revocation succeeded.
- No token persistence is introduced.

### Required commands

Run the commands that exist in this monorepo and report their actual outcomes:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm check`
- PostgreSQL integration tests using the repository's established `.env`/Vitest workflow
- `pnpm --filter @jmp/contracts run build`
- `pnpm --filter @jmp/api run build`
- `pnpm --filter @jmp/web run build`
- `pnpm run workspace:check`

Do not modify generated Prisma artifacts manually. If a schema change is genuinely required, create a proper migration, regenerate the Prisma client with the repository's Prisma 7 workflow, and include migration/integration evidence. Prefer no schema migration because current fields appear sufficient.

## 10. Definition of done

- Both refresh and logout endpoints are implemented and protected by strict Origin validation.
- Refresh rotation is atomic and replay detection revokes the correct token family.
- Expired/revoked/ineligible sessions cannot mint tokens.
- Only SHA-256 hashes are persisted; raw refresh credentials exist only in process memory long enough to set the HttpOnly cookie.
- Cookie behavior is consistent with login and safely cleared at logout.
- Browser reload can restore an in-memory access token through one coordinated refresh.
- Logout clears local auth state and revokes the current server-side token family.
- Unit, route, PostgreSQL integration, frontend, lint, typecheck, formatting, and build checks pass.
- PR targets `master`, includes a concise handoff, and is not marked Done in Jira until it is merged and final required CI succeeds.

## 11. Handoff report required from Antigravity

When implementation is complete, report:

1. Branch name, base commit, PR URL, and head commit.
2. Files created/modified grouped by contracts, API, Prisma/migrations, web, and tests.
3. Exact refresh and logout request/response behavior, including error semantics and cookie attributes.
4. Transaction/row-lock strategy and how concurrent replay is handled.
5. CSRF/Origin validation behavior and tests.
6. Whether a database migration was required; if yes, migration name and rationale.
7. Exact test counts and command outcomes, including real PostgreSQL integration results.
8. Any known limitations, especially cross-tab refresh fallback and the `sid` access-token revocation integration planned with JMP-38.
9. Confirm that no raw refresh token is logged, persisted, or returned in JSON.

Do not say the task is complete until the PR is merged and required CI checks pass.
