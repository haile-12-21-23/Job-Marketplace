# @jmp/web — Job Marketplace Web Application

Frontend application for the Job Marketplace (JMP) platform, built with **React 19**, **Vite**, **strict TypeScript**, **Tailwind CSS v4**, **React Router v7 Data Mode**, **Redux Toolkit**, and **RTK Query**.

---

## 1. Architecture Overview

### 1.1 Routing & Layout Hierarchy

Routing is configured in `src/app/router.tsx` using `createBrowserRouter` from `react-router` and rendered via `RouterProvider` from `react-router/dom`.

```text
/ (PublicLayout)
├── index (HomePage) — Hero, Search Preview, Categories, Live RTK Query API Status
└── * (NotFoundPage) — 404 recovery page
/app (AuthenticatedLayout)
└── index (AppHomePage) — Candidate & Employer Workspace (Placeholder)
```

- **`PublicLayout` (`src/layouts/PublicLayout.tsx`)**: Header, primary brand wordmark (`jobmarket`), public navigation (`Find jobs`, `Workspace (App)`), skip-to-content accessibility link, `<Outlet />`, and marketing footer.
- **`AuthenticatedLayout` (`src/layouts/AuthenticatedLayout.tsx`)**: Dedicated workspace layout with a prominent notice indicating this is a route placeholder. Header includes workspace navigation and a link back to the public site.
- **Important Note on Authentication**: The `/app` route is strictly a layout placeholder for this sprint. **No authentication guards, login redirects, fake session tokens, or RBAC checks are implemented.** Authentication and protected route guards will be added in a future development sprint.

### 1.2 Adding a New Route

To add a new route to the application:

1. Create your page component in `src/pages/<FeatureName>Page.tsx`.
2. Open `src/app/router.tsx`.
3. Add the route definition under the appropriate layout hierarchy:
   ```tsx
   // For a new public route:
   {
     path: 'jobs',
     element: <JobsBrowsePage />,
   }

   // For a new workspace route:
   {
     path: 'applications',
     element: <ApplicationsPage />,
   }
   ```
4. When linking to the new route, use `Link` or `NavLink` from `react-router`.

### 1.3 State Management & RTK Query

- **Store Configuration (`src/app/store.ts`)**: Created with `configureStore` from `@reduxjs/toolkit`. Mounts `baseApi.reducer` under its `reducerPath` (`api`) and registers `baseApi.middleware`.
- **Pre-typed Hooks (`src/app/hooks.ts`)**: Pre-typed `useAppDispatch` and `useAppSelector` for component consumption.
- **Shared Base API (`src/services/base-api.ts`)**: Central RTK Query entry point using `fetchBaseQuery` configured with `getApiBaseUrl()`.

### 1.4 Injecting Feature Endpoints into the Shared Base API

To avoid creating competing `createApi` instances across feature modules, feature slices inject their endpoints into the shared `baseApi` using code-splitting via `injectEndpoints`:

```ts
// src/services/jobs-api.ts
import { baseApi } from './base-api.js';
import type { JobSearchQueryInput, JobSearchQueryOutput } from '@jmp/contracts';

export const jobsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    searchJobs: builder.query<JobSearchQueryOutput, JobSearchQueryInput>({
      query: (params) => ({
        url: 'jobs',
        params,
      }),
      providesTags: ['Jobs'],
    }),
  }),
});

export const { useSearchJobsQuery } = jobsApi;
```

---

## 2. Environment Configuration

Copy the example environment file before starting local development:

```bash
cp apps/web/.env.example apps/web/.env
```

| Variable            | Description                                     | Default Value                  | Required |
| :------------------ | :---------------------------------------------- | :----------------------------- | :------: |
| `VITE_API_BASE_URL` | Public browser-accessible base path for the API | `http://localhost:3000/api/v1` |    No    |

> [!NOTE]
> `VITE_API_BASE_URL` is public client-side configuration bundled into static assets. Never add secrets, database credentials, or server-only keys with the `VITE_` prefix.

---

## 3. Available Scripts

From the repository root or inside `apps/web`:

| Command                            | Purpose                                                  |
| :--------------------------------- | :------------------------------------------------------- |
| `pnpm --filter @jmp/web dev`       | Start Vite development server at `http://localhost:5173` |
| `pnpm --filter @jmp/web build`     | Typecheck and build production bundle to `dist/`         |
| `pnpm --filter @jmp/web preview`   | Preview production build locally                         |
| `pnpm --filter @jmp/web lint`      | Lint source files with ESLint (zero-warning policy)      |
| `pnpm --filter @jmp/web typecheck` | Run strict TypeScript check without emitting             |
| `pnpm --filter @jmp/web test`      | Run Vitest unit & integration test suites in `jsdom`     |

---

## 4. Production Static Hosting Fallback

Because React Router uses client-side HTML5 History pushState routing, all deep links (e.g. `/app`, `/app/overview`) must be rewritten to serve `/index.html` on the static web host (e.g., Nginx, S3/CloudFront, Cloudflare Pages, Netlify, or Vercel).
