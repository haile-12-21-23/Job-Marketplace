# JMP-30 Implementation Handoff — React Router, Redux Toolkit, and RTK Query

**Jira Issue:** [JMP-30 — React Router, Redux Toolkit and RTK Query](https://hailemariamaddisu21.atlassian.net/browse/JMP-30)  
**Package:** `@jmp/web`  
**Date:** 2026-11-24  
**Status:** COMPLETE & FULLY VERIFIED

---

## 1. Executive Summary & Preflight Inspection

A full preflight audit was conducted on the monorepo and `apps/web` prior to making modifications:

- **Baseline Dependencies Retained:** React `19.1.0`, React DOM `19.1.0`, Vite `8.3.8`, Tailwind CSS `@tailwindcss/vite` `4.1.10`, Vitest `5.1.1`, and `@jmp/contracts` workspace reference.
- **Architectural Alignment:** Followed `JMP_Architecture_Design_v1.0.pdf` and `JMP_API_Standards_v1.0.pdf`. Retained the existing global `AppErrorBoundary`, `StrictMode`, responsive styling, semantic landmarks, and skip-to-content accessibility.
- **Scope Discipline:** Implemented React Router v7 Data Mode (`createBrowserRouter`, `RouterProvider`), Redux Toolkit with typed hooks, a shared base RTK Query API, and a live service status demonstration component. **Authentication, session state, route guards, and domain dashboards were strictly kept out of scope.**

---

## 2. Dependency Changes & Pinned Versions

New dependencies added to `apps/web/package.json`:

| Package            |  Version  | Justification & Compatibility                                                                                                                           |
| :----------------- | :-------: | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-router`     | `^7.18.6` | Official React Router v7 package. Provides `createBrowserRouter`, `Outlet`, `NavLink`, and `Link`. Compatible with React 19 (`peerDependencies: >=18`). |
| `@reduxjs/toolkit` | `^2.15.0` | Official Redux Toolkit including RTK Query (`createApi`, `fetchBaseQuery`). Compatible with React 19 (`peerDependencies: ^18 \|\| ^19`).                |
| `react-redux`      | `^9.3.1`  | Official React bindings for Redux. Supports `useDispatch.withTypes` and `useSelector.withTypes`.                                                        |

Lockfile `pnpm-lock.yaml` was cleanly resolved with zero peer dependency conflicts between React 19 and Redux/Router tooling.

---

## 3. Files Created and Modified

### 3.1 Routing & Layout Hierarchy

- **`apps/web/src/app/router.tsx`**: Defines client routes outside React render using `createBrowserRouter`:
  - `/` -> `PublicLayout` with index route `HomePage`.
  - `/app` -> `AuthenticatedLayout` with index route `AppHomePage` (placeholder).
  - `*` -> `NotFoundPage` (accessible 404 page).
- **`apps/web/src/layouts/PublicLayout.tsx`**: Public layout with brand wordmark (`jobmarket`), public navigation (`Find jobs`, `Workspace (App)`), skip-to-content accessibility link, `<Outlet />`, and footer.
- **`apps/web/src/layouts/AuthenticatedLayout.tsx`**: Workspace layout with a prominent notice banner indicating that `/app` is a layout placeholder with no active authentication guards.
- **`apps/web/src/pages/HomePage.tsx`**: Landing page incorporating hero section, search preview, foundation status cards, category preview, and the live `ApiStatusCard` RTK Query demonstration.
- **`apps/web/src/pages/AppHomePage.tsx`**: Future workspace placeholder page with explanatory disclaimer and placeholder feature cards.
- **`apps/web/src/pages/NotFoundPage.tsx`**: Accessible 404 recovery page with a return-to-home button.

### 3.2 State Management & RTK Query

- **`apps/web/src/app/store.ts`**: Configures Redux store via `configureStore`, mounts `baseApi.reducer` at `[baseApi.reducerPath]`, and registers `baseApi.middleware`. Exports `createAppStore()` factory for test isolation and `RootState`, `AppDispatch`, `AppStore` types.
- **`apps/web/src/app/hooks.ts`**: Pre-typed `useAppDispatch` and `useAppSelector` hooks using `useDispatch.withTypes<AppDispatch>()` and `useSelector.withTypes<RootState>()`.
- **`apps/web/src/app/providers.tsx`**: Application provider wrapper composing `<Provider store={...}>` with support for injected test stores.
- **`apps/web/src/services/base-api.ts`**: Central RTK Query Base API using `fetchBaseQuery`. Implements `getApiBaseUrl()` with trailing slash normalization (default `http://localhost:3000/api/v1`). Defines `getServiceStatus` query hook returning `DataEnvelope<ServiceMetadata>`.

### 3.3 UI Components & Entry Point

- **`apps/web/src/components/api-status/ApiStatusCard.tsx`**: Component consuming `useGetServiceStatusQuery()` demonstrating all 3 lifecycle states:
  1. **Loading:** Spinner with `role="status"` and accessible text "Connecting to API service...".
  2. **Error:** Alert banner with `role="alert"`, descriptive user-safe error message, and a functional "Retry" button invoking `refetch()`.
  3. **Success:** Card displaying returned service name (`Job Marketplace API`), API version (`v1`), and status (`ok`) from the standard envelope. Includes a "Refetch" action.
- **`apps/web/src/App.tsx`**: Mounts `AppProviders` and `RouterProvider`.
- **`apps/web/src/vite-env.d.ts`**: Typed `VITE_API_BASE_URL` in `ImportMetaEnv`.
- **`apps/web/.env.example`**: Documents `VITE_API_BASE_URL=http://localhost:3000/api/v1`.
- **`apps/web/README.md`**: Complete documentation covering architecture, route additions, code-split endpoint injection, environment configuration, and static hosting fallback notes.

---

## 4. Route Tree & Provider Composition

```text
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppProviders storeInstance={store}>
        <RouterProvider router={router} />
      </AppProviders>
    </AppErrorBoundary>
  </React.StrictMode>
);
```

### Route Table

| Path   | Layout                | Page Component | Purpose                                                                     |
| :----- | :-------------------- | :------------- | :-------------------------------------------------------------------------- |
| `/`    | `PublicLayout`        | `HomePage`     | Public homepage with search preview and live RTK Query API status           |
| `/app` | `AuthenticatedLayout` | `AppHomePage`  | Candidate & Employer workspace placeholder (unauthenticated in this sprint) |
| `*`    | `PublicLayout`        | `NotFoundPage` | Fallback 404 page                                                           |

---

## 5. Verification Commands and Exact Test Results

### 5.1 Web Package Quality Verification (`@jmp/web`)

**Commands executed:**

```bash
pnpm --filter @jmp/web lint
pnpm --filter @jmp/web typecheck
pnpm --filter @jmp/web test
pnpm --filter @jmp/web build
```

**Results:**

- **Lint:** ESLint passed with 0 errors and 0 warnings (`--max-warnings=0`).
- **Typecheck:** TypeScript compiler passed with 0 errors (`tsc --noEmit -p tsconfig.json`).
- **Test:** Vitest passed **8 test files, 27 tests, 0 failures**:
  - `src/services/base-api.test.ts` (3 tests) — Base URL normalization and `/api/v1` targeting
  - `src/app/store.test.ts` (3 tests) — Redux reducer/middleware registration and store isolation
  - `src/components/api-status/ApiStatusCard.test.tsx` (4 tests) — Loading, error/retry, and success states
  - `src/app/router.test.tsx` (4 tests) — Public, `/app`, 404, and link navigation
  - `src/components/layout/AppShell.test.tsx` (5 tests) — JMP-25 regression check
  - `src/app/AppErrorBoundary.test.tsx` (4 tests) — JMP-25 regression check
  - `src/contracts.test.ts` (3 tests) — JMP-28 regression check
  - `src/index.test.ts` (1 test) — JMP-25 regression check
- **Build:** Vite built production client bundle in 164ms (`dist/index.html`, `dist/assets/index-*.css`, `dist/assets/index-*.js`).

### 5.2 Monorepo-Wide Verification

**Command executed:**

```bash
pnpm workspace:check && pnpm check
```

**Summary of Monorepo Quality Check:**

1. `pnpm workspace:check` -> Structure OK (4 packages; all `workspace:*` references resolve).
2. `pnpm format:check` -> All matched files use Prettier code style!
3. `pnpm lint` -> 0 errors, 0 warnings across all workspace projects (`@jmp/config`, `@jmp/contracts`, `@jmp/api`, `@jmp/web`).
4. `pnpm typecheck` -> 0 compiler errors across all workspace packages.
5. `pnpm test` -> **17 test files passed, 103 tests passed across all 4 packages (0 failures)**:
   - `@jmp/config`: 1 test passed
   - `@jmp/contracts`: 38 tests passed
   - `@jmp/api`: 37 tests passed
   - `@jmp/web`: 27 tests passed

---

## 6. Live Development & Browser Smoke-Test Results

Both servers were started and verified simultaneously:

- **API Server:** `PORT=3006 pnpm --filter @jmp/api start`
  - Output: `Job Marketplace API listening on port 3006`
  - Endpoint verification: `curl -i http://localhost:3006/api/v1` returned HTTP 200 with `{ "data": { "service": "Job Marketplace API", "version": "v1", "status": "ok" } }`.
- **Web Dev Server:** `VITE_API_BASE_URL=http://localhost:3006/api/v1 pnpm --filter @jmp/web dev --port 5173`
  - Output: `VITE v8.3.8 ready in 220 ms. Local: http://localhost:5173/`
  - Route `/` verification: `curl -i http://localhost:5173/` returned HTTP 200 with HTML document.
  - Deep Link `/app` verification: `curl -i http://localhost:5173/app` returned HTTP 200 with HTML5 history rewrite fallback to `index.html`.
- **State Machine Verification for RTK Query Query Hook:**
  - **Loading:** Verified with suspended promise; component displays `<div role="status">` with spinner and text.
  - **Error & Retry:** Verified with 500/503 responses; component renders `<div role="alert">`, describes connection unavailability, and invokes `refetch()` when "Retry" is clicked.
  - **Success:** Verified with 200 JSON envelope; component renders service metadata, version badge, and "Connected" indicator.
  - **URL Targeting:** Verified `getApiBaseUrl()` with `query: () => ''` sends HTTP request to `http://localhost:3000/api/v1` without duplicating `/api/v1`.

---

## 7. Scope Boundaries & Explicit Non-Implementation

- **Authentication:** Unimplemented. No fake user, token storage, auth slice, or client-side route guards were added. The `/app` layout is explicitly labeled as a future authenticated-area placeholder.
- **Domain Feature Routes:** Real job search, employer posting workflows, and candidate profile pages were not created.
- **Backend / Database:** Untouched. Prisma schema, migrations, and API behavior remain identical to JMP-29.
