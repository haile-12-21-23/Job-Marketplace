# Antigravity Implementation Brief — JMP-33

## Target

**Jira:** [JMP-33 — Register a new user account](https://hailemariamaddisu21.atlassian.net/browse/JMP-33)  
**Sprint:** Sprint 2 — Authentication & Authorization  
**Priority:** Highest  
**Epic:** E03 — Authentication & Authorization

Implement the registration capability for a visitor to create a base Job Marketplace user identity. This is the first authentication-domain implementation task. Follow the existing repository structure and the approved project documents; do not redesign the architecture.

## 1. Repository and prerequisite checks

Before editing anything:

1. Run `git status --short`, inspect the current branch, and preserve all existing user changes. Do not reset, clean, stash, or overwrite unrelated work.
2. Confirm the checked-out integration branch contains the completed Sprint 1 foundation. Pull request **#13** (`JMP-32-GitHub-Action-CI`) was still open at handoff; do not assume its workflow commit is already in `master`. Confirm which branch contains the current foundation and base this work on the correct integration point. Do not merge or rewrite branches as part of this task.
3. Confirm the repository pins Node `24.22.3` and pnpm `12.17.0`; use the repository's package-manager settings and lockfile.
4. Review the existing module layout, `schema.prisma`, Prisma 7 config, migration history, shared Zod contracts, API error handling, request validation, logging, test fixtures, RTK Query base API and React Router setup.
5. Run the existing `pnpm check` before changes and record the baseline. Do not interpret a pre-existing failure as caused by this task.
6. Read the checked-in versions of `JMP_SRS_v1.0`, `JMP_ERD_v1.0`, `JMP_Architecture_Design_v1.0` and `JMP_API_Standards_v1.0` if present. Treat them as authoritative; do not rely on the old MERN implementation as the schema source.

If a required foundation artifact or migration is missing, stop and report the exact missing item rather than inventing a replacement architecture.

## 2. Product and data-model rules

The approved model treats `User` as a person's identity, not as an exclusive `JOB_SEEKER` or `EMPLOYER` account type. The logical ERD's `users` record contains `id`, unique normalized `email`, `password_hash`, `display_name`, `status` and nullable `email_verified_at`.

Registration must therefore:

- Create one base `User` identity with the submitted display name, normalized email and a secure password hash.
- Set `emailVerifiedAt` to `null`.
- Set `status` to the existing Prisma enum value that represents the approved initial, unverified account state. Inspect the actual schema and existing lifecycle semantics first. Do **not** invent a new enum value or silently treat an unverified account as verified. If the current enum has no valid unverified state, report that as a schema/product decision and propose the smallest migration rather than guessing.
- Enforce uniqueness of normalized email in PostgreSQL, not only in application code. Reuse the existing unique constraint/index.
- Keep the User creation flow atomic and safe under concurrent requests.

Do **not** automatically create a `JobSeekerProfile`, `EmployerAccount`, employer membership, or platform-admin grant. The SRS states that candidate and employer capabilities are separate from base identity; employer access is membership-scoped, and platform roles are separately granted.

## 3. API and contract implementation

Implement the registration endpoint in the existing Express 5 API module, using established module/service/controller/router conventions.

**Route:** `POST /api/v1/auth/register`

**Input contract:** validated `displayName`, `email` and `password` fields. Reuse the shared `@jmp/contracts` package; do not create a second independent frontend/backend definition.

Requirements:

- Trim and validate `displayName` and normalize email consistently using a reusable server-side helper. Email normalization must be `trim` plus lowercase, consistent with the approved normalized-email uniqueness rule.
- Reuse the current Zod version and project conventions. Reject unknown write-body properties as required by the API standard.
- Apply the password policy already defined in the codebase or approved documentation. Do not introduce a materially different policy or impose arbitrary complexity rules without documenting the reason.
- Hash passwords asynchronously with bcrypt, consistent with the SRS baseline. Reuse an existing compatible dependency/configuration; add a dependency only if the repository does not already provide one. Never persist or log plaintext passwords. Never return a password hash.
- Rely on the database unique constraint as the final concurrency guarantee. Catch Prisma's unique-constraint error (`P2002`) and translate it to the project's safe, stable API conflict/validation response. Do not return raw Prisma errors or database details. A pre-insert existence check may improve messaging but must not be the uniqueness guarantee.
- Return `201 Created` using the standard success envelope and a dedicated public response DTO. The DTO may expose only safe identity fields needed by the registration UI (for example `id`, `displayName`, `email`) and a clear `emailVerificationRequired: true` indicator. Confirm exact envelope and error semantics from the API standards and existing route implementations.
- Do not automatically log the user in. Do not issue an access token, refresh token, or session for an unverified account.
- Keep `createApp()` free of process, database lifecycle and listener side effects. Use the existing injected/testable database patterns.
- Use structured logs with safe diagnostic context. Never log passwords, hashes, bearer credentials, cookies or verification tokens.

### Verification boundary

`JMP-34` owns email-verification token issuance/consumption, expiry, resend throttling and delivery integration. This task must persist the new user as unverified, but must not implement the verification lifecycle or pretend an email has been sent. Do not create a plaintext verification token or expose one in the registration response. A `verificationRequired` response flag is acceptable; the next story supplies the verification flow.

## 4. Registration UI and test boundary

JMP-33's acceptance criteria require automated UI coverage, while JMP-40 owns the broader responsive authentication screens. Avoid duplicating that larger work:

- If a registration view/component already exists, wire it to the new API using the existing RTK Query base API and shared contract.
- If no registration view exists, create only a narrow, functional registration form/page sufficient to exercise this story. Use the project's established React Hook Form/Zod patterns if they are already installed; do not build login, email-verification or password-reset pages here.
- Provide accessible labels, inline field validation, server-error presentation, submitting/loading state and a clear success state that tells the user email verification is required without claiming a message was delivered.
- Do not store the password in Redux state or browser storage. Clear sensitive form state after a successful submission where appropriate.
- Leave the wider auth layout, visual polish and the remaining auth screens to JMP-40.

## 5. Tests and verification

Add automated tests at the relevant layers. Use the repository's existing Vitest/Supertest and React Testing Library patterns; do not introduce another test framework.

### Shared contract tests

- Valid registration payload.
- Missing/invalid display name, email and password.
- Unknown body fields are rejected according to the shared contract policy.
- Email normalization behavior is deterministic and covered where the normalizer lives.

### API integration tests

- Successful registration returns `201` and the standard success envelope.
- Stored email is normalized; stored display name is normalized according to the chosen rule.
- Stored password hash verifies against the submitted password with bcrypt; the stored value is not plaintext.
- New record has `emailVerifiedAt === null` and the correct existing unverified status.
- Response does not contain `password`, `passwordHash`, token material or session credentials.
- Duplicate normalized email returns the documented safe error without leaking database details.
- A uniqueness race cannot create two users with the same normalized email.
- Invalid body returns the standard validation problem response.
- Registration does not create a session, job-seeker profile, employer account or privileged platform role.

Use an isolated test database/transaction strategy already adopted by the repository. Never point tests at production or a developer's unrelated database.

### Web tests

- Client-side invalid input is blocked and field errors are accessible.
- Valid input calls the API once and shows the correct verification-required success state.
- Duplicate/validation/server errors are rendered without losing the user's non-secret fields unnecessarily.
- Submitting state prevents accidental duplicate submissions.

### Workspace verification

Run and report the exact results for:

```bash
pnpm --filter @jmp/contracts test
pnpm --filter @jmp/api test
pnpm --filter @jmp/web test
pnpm check
```

Also run the relevant production builds if they are not already included by `pnpm check`. If the repository uses slightly different script names, inspect `package.json` and report the exact equivalent commands rather than adding duplicate scripts.

## 6. Explicitly out of scope

Do not absorb the following Jira work into JMP-33:

- **JMP-34:** verification-token lifecycle, verification endpoint, resend limits and email delivery.
- **JMP-35 / JMP-36:** login, JWT issuance, refresh-token rotation, cookie configuration, logout and session revocation.
- **JMP-37:** password recovery/reset.
- **JMP-38:** reusable platform-role and permission middleware.
- **JMP-39:** authenticated profile read/update.
- **JMP-40:** full responsive authentication screen set and broader auth UX polish.

Do not add social sign-in, CAPTCHA, SMS OTP, phone verification, employer onboarding, job-seeker profile creation or unrelated schema changes.

## 7. Database and migration discipline

The identity and token entities were included in the Sprint 1 schema foundation. Prefer using the existing `User` model and migration. Do not create a redundant model, rename established columns or edit an already-applied migration.

Only add a new Prisma migration if implementation proves an approved schema requirement is missing. Explain the missing field/constraint, why it is necessary for this story, and its compatibility impact. Do not use destructive database commands or remove the persistent Docker volume. Keep the existing Docker PostgreSQL setup and host-port mapping intact; do not disturb the native PostgreSQL instance on port 5432.

## 8. Completion report / handoff

When finished, report:

1. Files/modules changed and the resulting request/response contract.
2. The actual initial user status used and why it is correct; confirm `emailVerifiedAt` remains null.
3. How email normalization, unique-conflict handling and bcrypt hashing work.
4. Confirmation that no session, verification token, candidate profile, employer account or privileged role is created by registration.
5. Tests added and exact command results, including total suite counts and `pnpm check`.
6. Migration name and application status, or explicitly state that no migration was needed.
7. Any criterion not verified, blocker, assumption or follow-up.

Do not claim the Jira story is complete merely because code was generated. Preserve a reviewable diff and leave unrelated changes untouched.
