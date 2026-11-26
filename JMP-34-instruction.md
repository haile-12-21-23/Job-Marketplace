# JMP-34 — Verify User Email Address

**Jira:** [JMP-34 — Verify user email address](https://hailemariamaddisu21.atlassian.net/browse/JMP-34)  
**Repository:** `haile-12-21-23/Job-Marketplace`  
**Sprint:** Sprint 2 — Authentication & Authorization  
**Priority:** High  
**Dependency:** JMP-33 — Register a new user account (merged into `master`)

## 1. Objective

Implement secure email verification for users created through the JMP-33 registration flow.

A registered user must receive a verification email containing a secure link and be able to verify their email through that link. Verification tokens must be cryptographically random, single-use, securely stored, and time-limited. Users must also be able to request another verification email under rate limits.

Fit the existing modular-monolith architecture and reuse the identity module and shared contracts introduced in JMP-33. Do not recreate or refactor the registration feature.

## 2. Mandatory Repository Inspection

Before editing code:

1. Confirm the working tree is clean and the current branch is based on the latest `origin/master`, including the merged JMP-33 implementation.
2. Read repository instructions such as `AGENTS.md` and package-specific guidance.
3. Inspect the Prisma schema and migrations, `User` model and `emailVerifiedAt`, identity module, registration contracts and `normalizeEmail`, API routing/error handling/configuration/logging, dependency injection, web routing/layouts/RTK Query/registration page, and existing email, notification, rate-limit, and test infrastructure.
4. Identify existing conventions before adding abstractions.
5. Report material schema or architecture gaps before making assumptions.

Do not blindly copy suggested names or structures below if the repository already has an established convention.

## 3. Verification Token Lifecycle

Implement a secure token lifecycle:

- Generate tokens with a cryptographically secure random generator and sufficient entropy to make them unguessable.
- Persist only a cryptographic hash of each raw token. Never store the raw token.
- Associate each token with its user and an expiration timestamp.
- Enforce single-use behavior.
- Unknown, malformed, expired, consumed, and superseded tokens must not verify an account.
- Make token lifetime configurable with a sensible default.
- Never expose raw tokens, token hashes, or complete verification URLs in logs, analytics, error details, or API responses.

Inspect the current schema first. Add a Prisma model and migration only if the required persistence capability is genuinely missing. Follow existing naming and migration conventions. A token record will generally need a user relationship, unique token hash, expiry, consumed state/timestamp, and creation timestamp.

## 4. Email Delivery

Use an email-delivery abstraction so identity/application logic does not depend directly on a specific provider.

Requirements:

- Reuse existing mail infrastructure if present; otherwise add a small provider abstraction appropriate to this application.
- Keep provider credentials and secrets in environment variables only.
- Validate required configuration using the existing environment-validation system.
- Configure the public frontend URL through environment configuration; never hardcode localhost or a production domain.
- Provide a development/test adapter so automated tests do not send real emails.
- Send a clear verification email with the verification link and expiry guidance.
- Handle provider errors safely. Do not log secrets, raw tokens, or complete verification URLs.

Do not build a general notification platform or unrelated email templates as part of JMP-34.

## 5. API Endpoints

Follow existing API conventions, response envelopes, validation middleware, and Problem Details error format.

### 5.1 Verify email

`POST /api/v1/auth/verify-email`

Request:

```json
{
  "token": "RAW_VERIFICATION_TOKEN"
}
```

Behavior:

1. Validate the body using a strict shared Zod contract.
2. Hash the submitted token using the same hashing strategy used when storing it.
3. Find a matching token that is not consumed and has not expired.
4. Reject unknown, expired, consumed, or superseded tokens using the project's safe error conventions.
5. Verify the associated user by setting `emailVerifiedAt` to the current timestamp.
6. Consume the token.
7. Perform token consumption and user verification atomically in a database transaction.

Ensure concurrency safety: concurrent requests for the same token must not both succeed. Return a consistent success response without exposing internal token or database details.

### 5.2 Resend verification email

`POST /api/v1/auth/resend-verification`

Request:

```json
{
  "email": "user@example.com"
}
```

Behavior:

- Normalize the email using the existing `normalizeEmail` helper from `@jmp/contracts`.
- For an existing unverified account, create a fresh token and send a new verification email.
- Supersede or invalidate previously issued active tokens for that user.
- Do not send verification emails to already-verified accounts.
- Apply rate limits to prevent abuse.
- Return a generic public response whether the email is registered, unknown, or already verified. Do not enable account enumeration.
- Handle provider failures without leaking account existence or internal details; log operational information safely on the server.
- Use existing rate-limiting infrastructure if available. Do not create a general-purpose rate-limit framework for this endpoint.
- Consider per-account and per-IP protections according to existing infrastructure and deployment constraints.

## 6. Frontend Integration

Implement only the UI required for this issue; do not redesign the full authentication experience.

- Add a verification page/route that reads the token from the URL.
- Submit the token to the verification endpoint.
- Show loading, success, invalid/expired-token, and unexpected-error states.
- Offer a resend-verification action where appropriate.
- Provide a simple resend form that accepts an email address.
- Display the same generic resend response regardless of whether the account exists.
- Reuse existing layouts, components, RTK Query setup, and shared contracts.
- Keep the UI accessible and responsive.

Do not implement the full login flow, password-reset UI, or broad authentication redesign. Those belong to other Jira issues.

## 7. Shared Contracts and Data Boundaries

Add or extend shared contracts in `@jmp/contracts` for:

- Verify-email request.
- Resend-verification request.
- Relevant response types, if needed.

Use strict request validation and existing API error conventions. Keep token persistence models separate from browser-facing DTOs. Never expose Prisma token records or token hashes through API responses.

## 8. Security and Scope Boundaries

- Do not create login sessions or issue access/refresh tokens during verification.
- Do not implement login, session refresh, or session revocation; those belong to JMP-35 and JMP-36.
- Do not implement password reset; that belongs to JMP-37.
- Do not create candidate/job-seeker or employer profiles.
- Do not grant platform roles.
- Do not change the meaning of `UserStatus`.
- Do not treat `UserStatus.ACTIVE` as proof of email verification. `emailVerifiedAt` remains the authoritative verification field.
- Do not weaken registration validation or email uniqueness.
- Never log plaintext passwords, password hashes, raw verification tokens, or complete verification URLs.
- Do not expose whether an email address is registered through the resend endpoint.
- Ensure subsequent authentication logic can use `emailVerifiedAt` as the verification gate.

## 9. Required Automated Tests

Add appropriate contract, application, repository, API, and frontend tests.

### Token lifecycle

- Token generation uses secure randomness.
- Only token hashes are persisted.
- A valid token verifies the correct user.
- Expiration is enforced.
- Unknown token is rejected.
- Reused token is rejected.
- Superseded token is rejected.
- Concurrent attempts cannot both consume the same token successfully.
- `emailVerifiedAt` is updated correctly and only once.

### Resend behavior

- An unverified account receives a new verification email.
- Previously active tokens are invalidated or superseded.
- A verified account does not receive another verification email.
- Known and unknown email addresses receive indistinguishable public responses.
- Rate limits are enforced.
- Provider failure is handled safely.
- Raw tokens and full verification URLs are absent from logs and responses.

### API and frontend

- Strict request validation.
- Correct response envelope and error format.
- Verification success and failure UI states.
- Resend form behavior and generic response.
- Regression coverage for JMP-33 registration.

Use injected clocks, deterministic test adapters, and fake email providers where useful. Tests must not send real emails or depend on real elapsed time.

## 10. Quality Gates

Run the complete repository checks, not only tests for the new module:

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

Also verify that the compiled API application resolves workspace package imports using the repository's established validation approach.

If any command fails, diagnose and fix the underlying issue. Do not skip failing checks or claim they passed.

## 11. Git and Delivery

- Create a dedicated branch using the repository's Jira naming convention, for example `JMP-34-Verify-user-email-address`.
- Start from the latest `origin/master`.
- Do not commit generated `node_modules` contents.
- Do not commit `.env` files, provider credentials, tokens, or other secrets.
- Do not merge the PR unless explicitly instructed.
- Do not force-push or rewrite shared history.

## 12. Required Handoff Report

When implementation is complete, provide:

1. Branch name and base commit.
2. Commit hash(es) and PR URL.
3. Files created and modified.
4. Database schema changes and migration details, or why no migration was needed.
5. Token generation, storage, expiry, consumption, and concurrency behavior.
6. Email provider/configuration and development adapter details.
7. Endpoint request/response examples.
8. Rate-limiting behavior.
9. Frontend routes and user flows.
10. Automated test results with suite and test counts.
11. Results of every quality gate and production build.
12. Environment variables required for local and production deployment.
13. Known limitations, blockers, or follow-up work.

Update JMP-34 in Jira with a concise implementation summary and PR link when available.

**Completion rule:** Do not mark JMP-34 Done until the PR is merged and required CI checks pass.

## 13. Execution Order

1. Inspect repository instructions, branch state, schema, and existing implementations.
2. Present a short implementation plan and identify any genuine blockers.
3. Implement token persistence and lifecycle, email abstraction, API endpoints, frontend flow, and tests.
4. Run all quality gates and production builds; fix failures.
5. Commit and push the dedicated branch, then open a PR without merging it.
6. Provide the complete handoff report and PR URL.
