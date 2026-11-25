# JMP-30 — React Router, Redux Toolkit and RTK Query

## 1. Objective

Implement the frontend routing and client-state foundation in `apps/web` for the Job Marketplace monorepo. Add React Router public and authenticated-area layout placeholders, a correctly typed Redux store and hooks, a shared RTK Query base API, and one real sample query that visibly handles loading, error, and success states.

This task is a foundation only. Do not implement authentication, authorization, actual job-search pages, employer workflows, or a production design system.

## 2. Mandatory preflight

Before editing:

1. Run `git status --short --branch`; preserve all user changes and do not reset, stash, overwrite, or clean unrelated files.
2. Inspect the root and `apps/web` `package.json`, `pnpm-lock.yaml`, Vite config, TypeScript configs, `src/main.tsx`, `src/App.tsx`, the existing `AppShell`, `AppErrorBoundary`, CSS, Vitest setup and tests.
3. Inspect workspace exports and actual version of `@jmp/contracts`; use the existing `DataEnvelope<T>` type and `API_VERSION` constant where they fit.
4. Read available repository copies of `JMP_Architecture_Design_v1.0.pdf`, `JMP_API_Standards_v1.0.pdf`, and `JMP_SRS_v1.0.pdf`. Follow the approved modular-monolith and `/api/v1` conventions.
5. Read current official documentation for React Router Data Mode, Redux Toolkit TypeScript setup, and RTK Query. Follow the APIs compatible with the installed versions; do not upgrade major dependencies just to match a documentation snippet.

## 3. Dependency and compatibility rules

- Keep the current React, React DOM, Vite, TypeScript and pnpm versions unless a real incompatibility is demonstrated.
- Use the current stable React Router API that matches the dependency selected after preflight. For React Router v7 Data Mode, the official package is `react-router`; use `createBrowserRouter` from `react-router` and `RouterProvider` from `react-router/dom` for the browser runtime. Do not add `@react-router/dev` or convert the application to Framework Mode.
- Add Redux Toolkit and React Redux only if not already present. RTK Query is included in Redux Toolkit; do not add a separate RTK Query package.
- Prefer official typed hooks with `useDispatch.withTypes<AppDispatch>()` and `useSelector.withTypes<RootState>()` when the installed React Redux version supports them. Otherwise use the documented explicit generic typing pattern.
- Keep package versions compatible with React 19 and the current TS configuration. Do not blindly install `latest` or alter unrelated dependencies.

## 4. Routing architecture

Use a single browser data router created once outside React render. Do not create it in a component or React state.

Create a clear, scalable route structure, adapting names to existing conventions. A suggested layout is:

```text
apps/web/src/
  app/
    router.tsx
    providers.tsx              # only if this improves existing composition
  layouts/
    PublicLayout.tsx
    AuthenticatedLayout.tsx
  pages/
    HomePage.tsx
    AppHomePage.tsx            # authenticated-area placeholder only
    NotFoundPage.tsx
```

Requirements:

- A public layout route with at least an index/home route.
- An authenticated-area layout route (for example `/app`) with a nested placeholder page.
- A not-found route.
- Use `Outlet`, `Link` or `NavLink` correctly; active navigation should be accessible and work with browser back/forward navigation.
- Preserve the existing app shell, error boundary, responsive styling and accessibility. Convert the existing disabled navigation placeholders into real navigation only where it makes sense for the new placeholder routes.
- Do not create a fake authenticated user, fake session, hard-coded auth decision, login redirect, or client-side authorization guard. Authentication is planned for a later sprint. Clearly label the `/app` layout as a future authenticated-area placeholder, not as protected functionality.
- Do not introduce loaders/actions/data fetching in React Router for this task; API fetching belongs to RTK Query.
- Ensure deep links and unknown routes render the correct route within the Vite dev server. Document any production static-host fallback requirement rather than inventing server configuration outside this issue.

## 5. Redux store and typed hooks

Create a small store foundation, for example:

```text
apps/web/src/app/store.ts
apps/web/src/app/hooks.ts
```

Requirements:

- Configure the store with `configureStore` from `@reduxjs/toolkit`.
- Register the RTK Query API reducer under its `reducerPath`.
- Append its middleware to the default middleware using the supported typed `getDefaultMiddleware` pattern.
- Export `RootState` and `AppDispatch` inferred from the configured store, not handwritten state interfaces.
- Export typed `useAppDispatch` and `useAppSelector` hooks.
- Keep the Redux state minimal. Do not add placeholder auth, user, jobs, employer or application slices without an actual requirement.
- Add `<Provider store={store}>` exactly once at the application root, preserving `StrictMode` and the existing error boundary.

## 6. RTK Query base API and sample endpoint

Create a reusable base API module, for example `apps/web/src/services/base-api.ts`, using `createApi` and `fetchBaseQuery` from `@reduxjs/toolkit/query/react`.

Configuration requirements:

- Use the API base URL from a browser-safe Vite variable such as `VITE_API_BASE_URL`, with a development fallback consistent with the current API (`http://localhost:3000/api/v1`).
- Add/update `apps/web/.env.example` and Vite env typings if required. This value is public client configuration, never a secret. Do not use server-only `DATABASE_URL`, credentials, or API secrets in Vite variables.
- Normalize the trailing slash and ensure endpoint paths do not accidentally duplicate `/api/v1`.
- Keep the base API reusable for later feature endpoint injection. Do not create multiple independent `createApi` instances for the same backend.
- Include an example endpoint for the existing backend route `GET /api/v1`, which returns the API standards success envelope: `{ data: { service, version, status } }`.
- Prefer the shared `DataEnvelope<T>` from `@jmp/contracts` for the response envelope. Use an inferred shared contract for the service metadata if one already exists; if it does not, define the smallest suitable typed sample response without coupling it to Prisma/server code, and explain the decision.
- Export the generated query hook and consume it from a visible sample component/page.
- Do not add authentication headers or fake bearer tokens. Authentication integration belongs to the later authentication sprint.
- Keep request/response types strict and do not use `any`.

The sample UI must demonstrate all three states from a real RTK Query hook:

1. Loading: show a clear loading indicator/message while the initial request is pending.
2. Error: show a user-safe error message and a retry action using the query hook's `refetch` method.
3. Success: render the returned service name, API version and status.

Do not fabricate success data when the API is offline. The page should display the error state honestly.

## 7. Application providers and composition

- Keep the router instance outside render, in one module.
- Compose Redux Provider and RouterProvider in a clean application entry/provider structure.
- Preserve existing `AppErrorBoundary`, `StrictMode`, CSS imports and app shell behavior.
- Avoid provider duplication or circular imports between router, store, API slice and pages.
- Ensure tests can mount the relevant page/router with a real test store or controlled mocked base query without reaching a live API.

## 8. Tests

Add meaningful tests using the existing Vitest and React Testing Library setup. Do not depend on a running backend or a live network in automated tests.

At minimum cover:

- Public route renders the public layout/home placeholder.
- `/app` renders the authenticated-area layout placeholder, without claiming to authenticate/authorize.
- Unknown route renders the not-found page.
- Store includes the RTK Query reducer/middleware and typed hooks compile.
- Sample query UI renders loading state.
- Sample query UI renders an error state and retry affordance.
- Sample query UI renders success data from `{ data: ... }` envelope.
- A URL/base-path test or equivalent assertion ensures requests target `/api/v1` exactly once.

Use a deterministic mock for `fetch`/base query or an already installed request-mocking tool. Do not add MSW solely for this task unless the current test setup makes it clearly beneficial. Restore mocks between tests and avoid leaking Redux cache state between cases.

## 9. Documentation

Update `apps/web/README.md` or the root README with:

- Route tree and layout responsibilities.
- How to add a new route.
- How to inject feature endpoints into the shared RTK Query API.
- API base URL configuration and `.env.example` usage.
- How to run web development, tests, typecheck and production build.
- A clear note that `/app` is a placeholder and no authentication guard exists yet.

## 10. Explicitly out of scope

Do not implement:

- Registration, login, logout, session persistence, token refresh, RBAC or route guards.
- Real job browse/search/detail features or employer/candidate dashboards.
- Feature-specific Redux slices unless genuinely required for the foundation.
- API feature endpoints beyond the minimal service metadata query.
- React Router Framework Mode, SSR, loaders/actions, server rendering or a new backend server.
- Docker Compose, API health/readiness routes (JMP-31), or GitHub Actions (JMP-32).
- Unrelated UI redesign or changes to the API/Prisma schema.

## 11. Required verification

Run and report the exact command/output for:

```bash
pnpm install
pnpm --filter @jmp/web lint
pnpm --filter @jmp/web typecheck
pnpm --filter @jmp/web test
pnpm --filter @jmp/web build
pnpm workspace:check
pnpm check
```

Also:

- Start the API using the existing development command and the web app using its Vite command.
- Verify the browser can navigate to the public route and `/app`, and back/forward navigation works.
- Verify the sample RTK Query request targets the configured `/api/v1` base and displays loading, error (API stopped/unavailable) and success (API running) states.
- If adding or changing dependencies, report exact package versions and lockfile changes.
- Confirm no unrelated files or previous completed JMP work were removed or rewritten.

## 12. Completion handoff

Provide a concise but complete handoff with:

1. Files created/modified and the role of each.
2. Final dependency versions.
3. Route tree and provider composition.
4. Redux store and RTK Query endpoint design.
5. Evidence for loading/error/success states and URL construction.
6. Test totals and exact commands/results.
7. Development/browser smoke-test results.
8. Explicit confirmation that authentication remains unimplemented and reserved for its planned sprint.
9. Any limitations or deferred issues; do not claim tests that were not run.
