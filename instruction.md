# Antigravity Task Instructions — JMP-25

**Task:** Bootstrap the Job Marketplace web application with React, Vite, strict TypeScript, Tailwind CSS, a basic application shell, and a global error boundary.  
**Jira:** [JMP-25 — Bootstrap React, Vite and strict TypeScript web application](https://hailemariamaddisu21.atlassian.net/browse/JMP-25)  
**Sprint:** Sprint 1 — Project Foundation  
**Repository:** Work in the existing `job-marketplace` repository. Do not create a separate project or duplicate the monorepo.

---

## 1. Role and objective

Act as a senior frontend engineer working in an existing pnpm TypeScript monorepo. Read the actual codebase before making changes. Implement **only the scope of JMP-25**, preserving the existing repository structure, dependency versions, package manager setup, shared configuration, lockfile, and any user changes.

The objective is to leave `apps/web` as a working React + Vite application that:

1. Starts in the local development environment.
2. Builds successfully for production.
3. Passes strict TypeScript checking.
4. Loads and demonstrates Tailwind CSS styles.
5. Has a clean, responsive application shell.
6. Has a global React error boundary with a useful fallback UI.

Do not mark the Jira issue Done or claim completion unless every acceptance criterion has been verified by running the relevant commands.

## 2. Read the repository first — do not edit immediately

Before changing files:

1. Run `pwd`, inspect the root directory, and run `git status --short`.
2. Read repository guidance files if present, including `AGENTS.md`, `README.md`, and any Antigravity/agent instruction files.
3. Inspect at least:
   - `package.json` and `pnpm-workspace.yaml` at the repository root.
   - `pnpm-lock.yaml` and the package manager/version configuration (`packageManager`, `.npmrc`, Corepack settings, etc.).
   - `apps/web/package.json`, `apps/web/tsconfig*.json`, `apps/web/vite.config.*`, and the existing `apps/web/src` tree.
   - Shared packages under `packages/`, especially `packages/config` and `packages/contracts`.
   - Root TypeScript, ESLint, Prettier, Tailwind, PostCSS, and Vitest configuration.
4. Locate and read the project baseline documents if they are available in the repository or its documentation folders:
   - `JMP_SRS_v1.0`
   - `JMP_Architecture_Design_v1.0`
   - `JMP_API_Standards_v1.0`
   - `JMP_UIUX_IA_Wireframes_v1.0`
5. Identify the installed Tailwind major version and configure it using that version's conventions. Do not mix Tailwind v3 and v4 configuration patterns.
6. Identify the exact workspace package names before importing or adding dependencies.

After inspection, state a short implementation plan and list the files you expect to change. Then implement. If the web app is already partially scaffolded, improve the existing implementation rather than replacing it wholesale.

### Protect existing work

- Do not overwrite or revert unrelated local modifications.
- Do not run destructive commands such as `git reset --hard`, `git clean -fd`, or broad file deletion.
- Do not replace the root `package.json`, workspace configuration, or lockfile just to make the app easier to scaffold.
- Do not upgrade React, Vite, TypeScript, Tailwind, pnpm, or other packages unless the current setup is demonstrably incompatible and the reason is explained.
- Do not commit or push changes unless explicitly requested.
- Never read, print, or expose secret values from `.env` files. Inspect only environment variable names or `.env.example` files where necessary.

## 3. Architecture and scope boundaries

Follow the approved modular-monolith and monorepo direction:

```text
job-marketplace/
├── apps/
│   ├── web/          # React browser application
│   └── api/          # Express API; do not modify for this task
├── packages/
│   ├── contracts/    # Shared Zod/API contracts; consume only if needed
│   └── config/       # Shared TypeScript/lint/tooling configuration
├── package.json
└── pnpm-workspace.yaml
```

The web client must remain independent of backend implementation details. It must not import from `apps/api`, Prisma models, database code, or server-only modules. Shared contracts may be imported from the existing workspace package if appropriate.

### Explicitly out of scope for JMP-25

Do not implement the full marketplace or start later Jira tasks prematurely. In particular, do not build:

- Authentication, registration, login, or role/permission flows.
- Job search, job details, job posting, applications, candidate profiles, or employer dashboards as functional product features.
- API integration, RTK Query endpoints, or mock backend services.
- React Router, Redux Toolkit, or RTK Query setup; those are tracked separately under **JMP-30**. Keep navigation to a simple non-routed starter shell unless the codebase already has routing in place.
- Full design-system/component-library abstraction.
- Production analytics, monitoring, or external logging integration.

A lightweight landing/placeholder view inside the shell is sufficient to demonstrate the frontend is running. Do not create misleading controls that appear to perform functionality that does not exist.

## 4. Frontend implementation requirements

### 4.1 React + Vite + TypeScript

- Use the repository's existing React, Vite, and TypeScript versions.
- Ensure the app entry point is correct and Vite resolves the React application from `apps/web`.
- Keep TypeScript strict. Do not solve errors by disabling `strict`, adding broad `any`, or weakening compiler options.
- Type component props, event handlers, and application-level values.
- Keep the implementation idiomatic and small; avoid unnecessary abstractions.
- Ensure the HTML entry document has a meaningful page title, language, viewport metadata, and a root mount element.

### 4.2 Maintainable source structure

Use the repository's existing conventions if they are sound. Otherwise, prefer a simple structure similar to:

```text
apps/web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css                # or the existing global stylesheet
    ├── app/
    │   └── AppErrorBoundary.tsx
    ├── components/
    │   └── layout/
    │       └── AppShell.tsx
    └── ...
```

Do not add folders simply to mirror this example if the project already uses another consistent structure.

### 4.3 Tailwind CSS

- Configure Tailwind using the installed major version and current Vite/PostCSS integration.
- Ensure the global CSS entry imports the Tailwind styles correctly.
- Prove that Tailwind is active by using a few real utility classes in the starter shell and checking the production build output.
- Remove obsolete or conflicting starter CSS only when it prevents Tailwind from working; preserve useful styles and existing tokens.
- Avoid custom styling frameworks or extra UI libraries for this task.

### 4.4 Basic application shell

Create a presentable, responsive shell that is a foundation for the approved Job Marketplace UX. Use the available UI/UX wireframe and product documents if present.

At minimum:

- A semantic page structure (`header`, `main`, and, where useful, `footer`).
- A simple Job Marketplace brand/wordmark treatment.
- A small, clearly non-functional starter navigation/placeholder area that does not imply the later workflows already exist.
- A visible main content area explaining that the marketplace frontend foundation is ready and that product modules will be introduced in later implementation tasks.
- Responsive layout behavior for narrow mobile and desktop widths.
- Readable typography, adequate spacing, visible keyboard focus, and accessible color contrast.

Keep the visuals deliberately foundational. Do not invent final branding, marketing copy, complex dashboard layouts, or full page designs when the approved wireframe/specification is available. If no UX reference is present, use a neutral, professional, restrained style and document any design assumptions.

### 4.5 Global React error boundary

Implement and mount a typed React error boundary high enough in the component tree to catch render/lifecycle errors in the application UI.

The fallback should:

- Explain that the page encountered an unexpected error in plain language.
- Provide a keyboard-accessible recovery action (for example, retry/reset the boundary or reload the page).
- Avoid exposing stack traces or sensitive technical details to end users.
- Keep the fallback visually consistent with the app shell and usable on mobile.

Add an appropriate test for the boundary if the existing test tooling supports it. Remember that React error boundaries do not catch errors from event handlers or arbitrary asynchronous callbacks; do not claim that they do.

### 4.6 Accessibility and quality

- Use semantic HTML and correct heading order.
- Ensure buttons and links have meaningful accessible names.
- Preserve keyboard navigation and visible focus states.
- Use responsive CSS/Tailwind behavior without horizontal overflow at common mobile widths.
- Do not introduce inaccessible clickable `div` elements.

## 5. Dependencies and workspace practices

- Prefer packages already installed at the root or in the workspace.
- Add only the dependencies required for this task.
- Use `pnpm` and `workspace:` protocol for internal package references where needed.
- Keep dependency versions aligned with the existing lockfile and package-manager configuration.
- If dependencies change, update the lockfile with the repository's pinned pnpm version.
- Do not add React Router or Redux dependencies as part of JMP-25 unless they already exist and are already part of the accepted scaffold; their configuration belongs to JMP-30.

## 6. Testing and verification — required before completion

First inspect the actual package scripts and run the commands appropriate to the repository. At minimum verify:

1. Install state is reproducible and the lockfile is consistent. If dependencies were changed, run the install command using the pinned pnpm version and appropriate frozen-lockfile policy.
2. The web app starts with its documented dev command. Confirm Vite prints its ready URL without startup errors.
3. The web app builds successfully for production.
4. Strict TypeScript checks pass for the web app and at the root if a root script exists.
5. Root lint and test checks pass.
6. Tailwind is visibly applied in the running app and its styles are included in the production build.
7. The application shell renders and the error boundary fallback can be exercised in a test or a controlled development-only test path. Remove any test-only trigger from production UI.
8. Inspect at least a desktop viewport and a mobile viewport around 390px wide if a browser preview is available.

Likely root commands (confirm script names before running):

```bash
pnpm check
pnpm --filter <web-package-name> dev
pnpm --filter <web-package-name> build
```

If the package has separate scripts, run the equivalent commands from `apps/web`. Do not report a command as passed unless it was actually run and returned successfully. If a check is blocked by network, environment, or an unrelated pre-existing problem, give the exact error and distinguish it from a code failure.

## 7. Definition of done for this task

JMP-25 is ready to move to Done only when all of the following are true:

- [ ] React + Vite web application exists in the existing `apps/web` workspace.
- [ ] `pnpm dev` (or the documented web package dev command) starts successfully.
- [ ] Production build completes successfully.
- [ ] Strict TypeScript check passes without weakening compiler settings.
- [ ] Tailwind is configured correctly and visibly styles the app shell.
- [ ] A responsive, accessible basic app shell is present.
- [ ] A global React error boundary is mounted and its fallback/recovery path is covered.
- [ ] Existing workspace root lint, typecheck, and test checks pass.
- [ ] No out-of-scope feature or architecture work was added.
- [ ] README or app-level setup notes are accurate if the run commands changed.

If any checkbox is incomplete, leave the task as In Progress and report exactly what remains.

## 8. Final response format

When implementation is finished, return a concise engineering handoff with:

1. **What changed** — important files and app structure.
2. **Design decisions** — Tailwind version/config used, app shell structure, error boundary behavior, and any relevant assumptions.
3. **Commands executed** — exact commands and pass/fail results for dev startup, production build, typecheck, lint, and tests.
4. **Acceptance checklist** — explicitly state which JMP-25 criteria are satisfied and which are not.
5. **Risks or follow-up** — only real blockers or items intentionally deferred to later Jira tasks.

Do not claim the Jira issue has been updated unless you actually updated it. Do not claim the work is Done unless the verification above passed.
