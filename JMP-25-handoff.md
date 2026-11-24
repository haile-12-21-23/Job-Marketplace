# JMP-25 Engineering Handoff (Revised) — Bootstrap React + Vite + TypeScript Web Application

**Sprint:** Sprint 1 — Project Foundation  
**Task:** [JMP-25 — Bootstrap React, Vite and strict TypeScript web application](https://hailemariamaddisu21.atlassian.net/browse/JMP-25)  
**Workspace Package:** `@jmp/web`  
**Status:** ✅ **DONE** — fully verified against repository instructions and approved UX wireframes (`JMP_UIUX_IA_Wireframes_v1.0.md` & `JMP_UI_Wireframes_v1.0.html`).

---

## 1. What Changed & Application Structure

```text
apps/web/
├── index.html                           # Semantic HTML entry with metadata and #root mount
├── package.json                         # Dependencies, dev tooling, and build/dev scripts
├── tsconfig.json                        # Strict TypeScript config extending @jmp/config/typescript/web.json
├── vite.config.ts                       # Vite 8 config with React and Tailwind v4 plugins
├── vitest.config.ts                     # Vitest config (jsdom environment, setup file)
└── src/
    ├── main.tsx                         # React 19 entry mounting App within StrictMode & AppErrorBoundary
    ├── App.tsx                          # App component rendering AppShell
    ├── vite-env.d.ts                    # Vite client types for env & CSS imports
    ├── index.css                        # Tailwind v4 import + @theme brand color tokens & resets
    ├── index.ts                         # Main package export (WEB_APP_NAME, WEB_API_BASE_PATH)
    ├── index.test.ts                    # Package integration test
    ├── app/
    │   ├── AppErrorBoundary.tsx         # Global React Error Boundary with accessible fallback UI
    │   └── AppErrorBoundary.test.tsx    # 4 unit tests covering normal render, catch, and reset flows
    ├── components/
    │   └── layout/
    │       ├── AppShell.tsx             # Responsive application shell aligned with JMP UX baseline
    │       └── AppShell.test.tsx        # 5 unit tests verifying landmarks, brand, and a11y
    └── test/
        └── setup.ts                     # Jest-DOM matchers setup for Vitest
```

---

## 2. Design Decisions & UX Baseline Alignment

### Approved UX Wireframe Integration (`JMP_UIUX_IA_Wireframes_v1.0.md` & `JMP_UI_Wireframes_v1.0.html`)

- **Brand & Wordmark**:
  Implemented `jobmarket` brand treatment matching wireframe Screen 01 (`job` in `#17324d` navy and `market` in `#16847f` teal italic) with accessible home link and keyboard focus indicator.
- **Brand Palette Tokens (@theme)**:
  Configured native Tailwind v4 `@theme` tokens in `src/index.css`:
  - `--color-brand-navy: #17324d`
  - `--color-brand-teal: #16847f`
  - `--color-brand-blue: #2f6f95`
  - `--color-brand-ink: #1d3448`
  - `--color-brand-muted: #657789`
  - `--color-brand-line: #d4dee7`
  - `--color-brand-soft: #f4f7fa`
  - `--color-brand-accent: #e8f3f1`
- **Application Shell Structure**:
  - Semantic landmark hierarchy: `<header>`, `<main id="main-content">`, and `<footer>`.
  - Accessible skip-to-content link for keyboard navigation.
  - Navigation links (`Find jobs`, `For employers`, `Career resources`, `Sign in`, `Create account`) are styled placeholders with `aria-disabled="true"` and explanatory tooltips to prevent misleading users before router/auth tasks (JMP-30).
  - Mobile secondary navigation row ensuring zero horizontal overflow on small viewports (~390px).
- **Landing Content Area**:
  - Hero section reflecting wireframe Screen 01 ("Work that moves your life forward.", "Foundation ready · Sprint 1").
  - Non-functional search input mockup indicating search functionality will arrive in JMP-30.
  - 3 Foundation status cards (`React + Vite`, `Tailwind CSS v4`, `Error Boundary`).
  - Explore by category preview cards (`Technology`, `Business & Finance`, `Engineering`).

### Global Error Boundary (`AppErrorBoundary`)

- Class component implementing `getDerivedStateFromError` and `componentDidCatch`.
- Clear plain-language message: "Something went wrong".
- Two recovery actions: **Try again** (resets error state in memory) and **Reload page** (`window.location.reload()`).
- Omit stack traces or technical details from end-user display.
- **Controlled Dev-Only Test Path**: Added `DevErrorTrigger` in `AppShell` that only triggers if `import.meta.env.DEV` is true and `?simulate-error=1` is in the URL query string. In production builds, dead-code elimination eliminates this branch completely.

---

## 3. Verification Commands and Results

| Check / Command                    | Status  | Output Summary                                                                |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `pnpm --filter @jmp/web dev`       | ✅ PASS | Vite 8 ready in ~280ms on `http://localhost:5173/`, returns 200 OK            |
| `pnpm --filter @jmp/web build`     | ✅ PASS | Production build completed in 89ms (`16.28 kB` CSS, `229.88 kB` JS)           |
| `pnpm --filter @jmp/web lint`      | ✅ PASS | ESLint exited with 0 warnings and 0 errors                                    |
| `pnpm --filter @jmp/web typecheck` | ✅ PASS | Strict TypeScript compiler check passed without warnings                      |
| `pnpm --filter @jmp/web test`      | ✅ PASS | 10 tests passed across 3 test files (`AppShell`, `AppErrorBoundary`, `index`) |
| `pnpm workspace:check`             | ✅ PASS | Workspace structure OK (4 packages; all `workspace:*` references resolve)     |
| `pnpm check`                       | ✅ PASS | Full monorepo check passed (lint, typecheck, tests) across all packages       |

---

## 4. Acceptance Checklist (JMP-25)

- [x] React + Vite web application exists in the existing `apps/web` workspace.
- [x] `pnpm dev` (or `pnpm --filter @jmp/web dev`) starts successfully.
- [x] Production build completes successfully.
- [x] Strict TypeScript check passes without weakening compiler settings.
- [x] Tailwind CSS v4 is configured correctly and visibly styles the app shell.
- [x] A responsive, accessible basic app shell is present matching the approved wireframe baseline.
- [x] A global React error boundary is mounted and its fallback/recovery path is covered.
- [x] Existing workspace root lint, typecheck, and test checks pass.
- [x] No out-of-scope feature or architecture work was added.
- [x] Documentation / setup notes are accurate.
