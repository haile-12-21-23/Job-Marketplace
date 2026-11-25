# JMP-32 — GitHub Actions CI Implementation Brief

**Project:** Job Marketplace (JMP)  
**Jira:** JMP-32 — Configure GitHub Actions CI for lint, typecheck, tests and builds  
**Sprint:** Sprint 1 — Project Foundation  
**Target package scope:** Monorepo (`@jmp/config`, `@jmp/contracts`, `@jmp/api`, `@jmp/web`)

## 1. Objective

Create a reliable GitHub Actions workflow for pull requests and changes to the repository's primary branch. CI must reproduce the local quality checks using the committed pnpm lockfile, run all required lint/typecheck/test/build tasks, and fail the workflow whenever a required command fails.

Ordinary CI must not depend on production services, production database credentials, deployment credentials, private registry credentials, or any other production secrets.

## 2. Mandatory preflight — inspect before editing

Before changing anything:

1. Run `git status --short --branch` and preserve all existing work. Do not discard, reset, stash, amend, or overwrite the user's changes.
2. Inspect the root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc` (if present), runtime/package-manager declarations (`engines`, `packageManager`, `.node-version`, `.nvmrc`, `pnpm-workspace.yaml`), and every workspace package script.
3. Confirm the current toolchain from repository declarations and the latest local handoff: Node `24.22.3` / compatible Node 24 runtime and pnpm `12.17.0`. Use the repository's committed source of truth if it differs; do not silently upgrade either version.
4. Inspect Prisma 7 config (`apps/api/prisma7.config.ts`), migration files, API test setup and database tests. Determine whether tests need a live PostgreSQL service and whether the migration should be applied before tests.
5. Inspect existing `.github/workflows`, Dependabot configuration and branch naming. Extend existing conventions rather than creating duplicate or conflicting workflows.
6. Review the most recent successful local commands: `pnpm workspace:check`, `pnpm check`, package builds, and the JMP-31 Docker/PostgreSQL 18.7 verification.

Record the actual commands and package scripts found. Do not assume a root `build` script exists.

## 3. Workflow deliverable

Create or update a single primary workflow, preferably:

`/.github/workflows/ci.yml`

Use a clear workflow name such as `CI`. Trigger it on:

- `pull_request` for changes proposed to the repository (including forks, where GitHub provides the normal read-only token behavior).
- `push` to the actual primary branch discovered during preflight (usually `main`).
- Optionally `workflow_dispatch` for manual re-runs.

Avoid triggering on every branch push unless the repository already follows that policy. Add path filters only if they cannot accidentally skip required checks for shared root configuration, lockfiles, contracts or API code.

Add concurrency cancellation for superseded runs on the same PR/branch, using a group derived from workflow and ref. Do not cancel unrelated PRs.

## 4. Toolchain and deterministic install

The workflow must:

1. Run on a current GitHub-hosted Ubuntu runner compatible with Node 24 and PostgreSQL service containers.
2. Check out the exact triggering commit.
3. Install the exact pnpm version declared by the repo (`12.17.0` at handoff time) using the official `pnpm/action-setup` action.
4. Install the exact Node version declared by the repo (Node `24.22.3` at handoff time) using the official `actions/setup-node` action.
5. Configure pnpm dependency caching using `pnpm-lock.yaml` as the cache dependency path.
6. Run `pnpm install --frozen-lockfile`. CI must never silently rewrite `pnpm-lock.yaml` or install with `--no-frozen-lockfile`.
7. Print `node --version`, `pnpm --version` and (optionally) `pnpm store path` for useful diagnostics.

Use current official action majors only after verifying they exist and support the requested inputs. At the time this brief was prepared, upstream action documentation shows `actions/checkout@v7`, `actions/setup-node@v7` and `pnpm/action-setup@v6`. Prefer pinning actions to verified full commit SHAs with a release-tag comment where practical. Never invent a SHA or copy one from an unrelated fork. If the repository standard is major tags, use the verified official major tags and document the choice.

## 5. Least-privilege and workflow security

- Set workflow/job permissions to the minimum necessary; ordinary CI should need only `contents: read`.
- Do not grant `write-all`, pull-request write, package publish, deployment or OIDC permissions.
- Do not use `pull_request_target` to check out or execute untrusted PR code.
- Do not interpolate untrusted PR titles, branch names, commit messages or user-controlled fields directly into shell scripts.
- Do not print environment variables, database URLs, tokens or secrets.
- Do not add production secrets to repository or environment settings for this workflow.
- Use only fixed, disposable CI credentials for an ephemeral PostgreSQL service; these are test values, not repository secrets.
- Ensure actions receive no unnecessary secrets and no production service endpoints.

## 6. PostgreSQL service for API integration tests

Inspect `apps/api` tests and Prisma configuration. The current project has Prisma ORM 7.10.1, a PostgreSQL adapter, and DB-oriented tests. If those tests require a live database, configure a GitHub Actions PostgreSQL service container matching the supported local development major (PostgreSQL 18; use the same compatible official 18.7 image unless repository policy explicitly selects a later patched 18.x image).

For a job running directly on `ubuntu-latest`:

- Expose container port 5432 on runner port 5432.
- Set CI-only values such as `POSTGRES_USER=jmp_ci`, `POSTGRES_PASSWORD=jmp_ci_password`, and `POSTGRES_DB=jmp_ci`.
- Add a `pg_isready` health check with interval, timeout, retries and start period so tests do not race service startup.
- Set `DATABASE_URL=postgresql://jmp_ci:jmp_ci_password@localhost:5432/jmp_ci?schema=public` in the job environment. This must be the ephemeral service, not a production URL.
- Add `SHADOW_DATABASE_URL` only if Prisma commands invoked by CI require it; use a second disposable database on the same service and create it in a deterministic step.
- Never run `docker compose down -v`, destructive local developer scripts, or anything that can affect a developer's persistent volume. GitHub's service container is disposable at job end.

If the existing API tests fully mock the database and no test or build command needs a database, do not add an unnecessary service. Base this decision on actual test code and prove it in a clean-runner-compatible test. If a service is required, apply committed migrations with Prisma 7's deploy command before running the DB-dependent tests; do not use `migrate dev` in CI. Inspect the available CLI scripts/config and use the correct explicit config file `prisma7.config.ts`.

Do not seed production-like role data unless tests require it. If seeding is required, use the disposable CI database only.

## 7. Required CI checks and execution order

CI must execute every package's quality checks and all production builds. Prefer the repository's canonical root scripts where they correctly cover all workspaces.

Recommended sequence after install and database readiness (if needed):

1. `pnpm workspace:check`
2. If a database service is needed, verify `pg_isready`, then apply migrations using Prisma 7's production-safe deploy flow against the ephemeral CI database.
3. `pnpm check` — currently includes `format:check`, lint, typecheck and tests. Confirm this by reading the real root script; do not duplicate or skip checks silently.
4. Production builds for every package that defines a build script. At minimum verify the actual scripts and ensure `@jmp/contracts`, `@jmp/api` and `@jmp/web` production builds execute. Include `@jmp/config` only if it has a build step.
5. Verify that Prisma Client generation is part of the API build or run the corresponding explicit generation command before the API build.

Do not use `continue-on-error`, `|| true`, `--passWithNoTests` as a substitute for a missing test suite, or shell constructs that hide exit codes. Every required command must fail the job on non-zero exit. Prefer separate named workflow steps so the failed check is obvious.

If `pnpm check` already runs formatting, lint, typecheck and tests, it is acceptable to use that single command for those checks, but retain separate named steps if this gives clearer GitHub check names and does not double-run tests unnecessarily. Make sure production builds are separate mandatory steps.

## 8. Build and test correctness

- Run the same commands that developers run locally; no alternate reduced CI-only test set.
- Ensure tests run in the intended Vitest environments (Node for API/contracts/config, jsdom for web).
- Keep API `createApp()` tests isolated from network port binding.
- If any API database tests need live PostgreSQL, the PostgreSQL service and migration step must make them deterministic.
- Confirm `@jmp/contracts` builds before consumers if production builds do not already enforce workspace build ordering.
- Ensure the API's compiled production build resolves the compiled `@jmp/contracts` export (the production export points to `dist/index.js`); do not let CI accidentally test only the development TypeScript export.
- Do not change application code, dependency versions, lint policy, TypeScript strictness or migration history solely to make CI green. Fix the actual root issue and report scope changes.

## 9. Failure behavior and GitHub status checks

- A failing install, lockfile mismatch, format check, lint, typecheck, test, migration or production build must produce a failed job/workflow.
- No required job should be marked successful when a preceding required check failed.
- Use a stable job name such as `build-and-test` or a stable set of named jobs so repository branch protection can require the check.
- Document the manual repository setting needed to require the CI status check before merging: Settings → Branches / Rulesets → rule for the primary branch → require status checks to pass → select the workflow's stable job name. Do not claim this repository rule has been enabled unless it was actually configured and verified.
- If the repository currently has no protected primary branch, report that branch protection is a GitHub settings follow-up, not a YAML workflow feature.

## 10. Documentation

Update the root README (or an existing development/CI guide) with:

- What triggers CI (PRs and primary-branch pushes).
- The checks performed and the supported Node/pnpm versions.
- How to reproduce CI locally (`pnpm install --frozen-lockfile`, `pnpm workspace:check`, `pnpm check`, and the production build commands discovered during preflight).
- Whether CI uses an ephemeral PostgreSQL service and how the CI database is isolated.
- The stable GitHub check name and any manual branch-protection setup required.

Do not put actual secrets in documentation.

## 11. Explicit scope boundaries

In scope:

- GitHub Actions workflow for install, quality checks, tests and production builds.
- Minimal ephemeral PostgreSQL service configuration only if required by current API tests/Prisma build.
- CI documentation and a minimal workflow validation.

Out of scope:

- Deployment/release pipelines, publishing packages, production migrations, production secrets, hosting configuration or cloud deployment.
- Authentication features or business-domain endpoints.
- Rewriting the existing test suite or weakening strict checks.
- Changing database schema/migrations or local Docker Compose behavior.
- Enabling repository branch protection directly unless the task explicitly grants access and the configuration can be verified; document the manual follow-up instead.

## 12. Verification required before handoff

Run and report:

1. `pnpm install --frozen-lockfile` (or demonstrate GitHub runner install success).
2. `pnpm workspace:check`.
3. `pnpm check`.
4. All production package builds (`@jmp/contracts`, `@jmp/api`, `@jmp/web`, plus any other package that has a build script).
5. CI workflow syntax validation using an available YAML/action linter (for example actionlint), or another explicit parser if actionlint is unavailable.
6. If configured, confirm PostgreSQL service reaches healthy, migration deploy succeeds, and DB-dependent tests pass against the ephemeral service.
7. Confirm a deliberately failing command or temporary local test of failure propagation is not swallowed; do not commit an intentionally failing workflow step.
8. Confirm the actual GitHub Actions run succeeds for a pull request or primary-branch push. A local YAML parse alone does not prove the hosted workflow works.
9. Confirm no production secrets are required or referenced.
10. Inspect `git diff --check`, `git status`, and the final workflow diff.

The developer handoff must include the workflow path, triggers, runner/tool versions, action references (and pin strategy), permissions, any PostgreSQL service configuration, exact commands/results, GitHub Actions run URL or run identifier, and any manual branch-protection follow-up. Never report the hosted workflow as passing unless it actually ran on GitHub.

## 13. Completion criteria

JMP-32 is complete only when:

- Dependencies install reproducibly from the committed pnpm lockfile.
- Lint, typecheck, tests and all production builds run in CI.
- Any required PostgreSQL-dependent checks run against an ephemeral CI database, not a production or developer database.
- Failures propagate to a failed workflow/status check.
- Ordinary CI requires no production secrets.
- The actual GitHub Actions run is green and the implementation handoff documents the evidence.
