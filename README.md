# Job Marketplace - Monorepo Starter

This repository is the initial workspace foundation for the Job Marketplace (JMP) platform. It is a **pnpm TypeScript monorepo** with separate web and API applications and shared workspace packages.

## Requirements

- Node.js `24.22.3` or newer compatible LTS release.
- pnpm `12.17.0` (pinned through the root `packageManager` field and Corepack).
- Git.

The `.nvmrc` and `.node-version` files pin the baseline Node patch release for local development. Newer supported LTS releases can be used if the team deliberately updates the baseline.

## First-time setup

```bash
# Install/use the pinned Node version (nvm example)
nvm install --lts
nvm use --lts

# Enable Corepack and activate the pinned pnpm release
corepack enable
corepack prepare pnpm@12.17.0 --activate

# Install the workspace dependencies and generate pnpm-lock.yaml
pnpm install

# Verify the workspace package graph and tooling
pnpm workspace:check
pnpm check
```

Commit the generated `pnpm-lock.yaml`. CI and other developers should then use `pnpm install --frozen-lockfile` to install the exact dependency graph.

## Root commands

| Command                | Purpose                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm lint`            | Run lint scripts in all workspace packages that define one.                                   |
| `pnpm typecheck`       | Run TypeScript checks in all workspace packages that define one.                              |
| `pnpm test`            | Run tests in all workspace packages that define one.                                          |
| `pnpm check`           | Run format check, lint, typecheck and tests in sequence.                                      |
| `pnpm format`          | Format supported files with Prettier.                                                         |
| `pnpm format:check`    | Check formatting without changing files.                                                      |
| `pnpm workspace:check` | Validate workspace folders and internal `workspace:*` references without installing packages. |

## Workspace layout

```text
apps/
  web/                  # React/Vite app will be bootstrapped in JMP-25
  api/                  # Express/TypeScript API will be bootstrapped in JMP-26
packages/
  contracts/             # Shared API contracts; Zod schemas are added in JMP-28
  config/                # Shared TypeScript configuration and project config package
scripts/
  check-workspace.mjs    # Offline workspace structure/dependency check
```

## Package boundaries

- `@jmp/web` and `@jmp/api` depend on `@jmp/contracts` and `@jmp/config` through `workspace:*` dependencies.
- `@jmp/contracts` uses the shared configuration package for its TypeScript setup.
- `@jmp/config` owns shared TypeScript presets. App-specific runtime tooling belongs in the corresponding app package.
- Shared packages must not import from `apps/web` or `apps/api`. Applications may depend on shared packages; shared packages must remain application-agnostic.
- The API is a separate application and must not import from the web app. Future mobile clients consume the API contract, not frontend implementation modules.

## Scope of this starter

This commit establishes the workspace, package names, root scripts and reusable configuration. It intentionally does **not** add React/Vite, Express, Prisma, Zod schemas, routing or application features; those are owned by the next foundation issues (JMP-25 through JMP-28). This avoids duplicating work across sequential Jira tasks.

## Toolchain baseline

Tool versions are pinned in the root manifest for reproducible setup. The TypeScript compiler is pinned to the 6.0 line because the selected stable `typescript-eslint` release currently declares TypeScript support below 6.1. Upgrade that pair together when the lint toolchain officially supports the next TypeScript major.

## Run the project

### Frontend

```Shell
pnpm --filter @jmp/web dev
```

### Backend

```Shell
pnpm --filter @jmp/api dev
```

## Expected local URLs

Frontend: <http://localhost:5173>
Backend: <http://localhost:3000>
