# JMP-28 Final Production-Runtime Compatibility & Implementation Handoff

## 1. Summary of Changes & Architecture

### Package Structure

JMP-28 establishes the browser-safe, shared Zod contract package (`@jmp/contracts`) consumed by both `@jmp/web` (React/Vite) and `@jmp/api` (Express/Node.js). The schemas serve as the single source of truth for public request and response shapes, with TypeScript types inferred directly:

```text
packages/contracts/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
├── dist/                # Emitted JS, d.ts, and maps
└── src/
    ├── common/
    │   ├── identifiers.ts
    │   ├── pagination.ts
    │   ├── envelopes.ts
    │   ├── problem-details.ts
    │   └── common.test.ts
    ├── jobs/
    │   ├── job-search.ts
    │   └── job-search.test.ts
    ├── index.ts
    └── index.test.ts
```

### Key Architectural Boundaries:

- **Zero Server Leaks**: `@jmp/contracts` contains zero dependencies on Prisma, database drivers (`pg`), Express, Node.js built-ins (`fs`, `path`), server environment variables, or secrets.
- **Strict Separation from ORM Models**: Public DTOs describe the public HTTP interface and never mirror internal Prisma models or expose internal database sequential IDs.
- **Type Inference**: All public TypeScript interfaces are inferred via `z.input` and `z.output` (`z.infer`). No duplicate handwritten interfaces are maintained.
- **Strict Write Validation**: Write and query request schemas employ `.strict()` to reject unknown fields and prevent parameter pollution.
- **Forward-Compatible Responses**: Response schemas (such as Problem Details) avoid unnecessary `.strict()` enforcement so clients can safely tolerate additive fields.

---

## 2. Package Configuration & Production Export Strategy

### Dual Resolution Configuration (`packages/contracts/package.json`):

```json
{
  "name": "@jmp/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "development": "./src/index.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint src --max-warnings=0",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@jmp/config": "workspace:*"
  }
}
```

- **Production Node Runtime**: Standard Node.js (`node dist/server.js`) resolves `"default": "./dist/index.js"` and its emitted relative imports (e.g. `./common/identifiers.js`) from compiled JavaScript in `dist/`.
- **Vite & Frontend Development**: Vite resolves `"development": "./src/index.ts"` (and `"types": "./src/index.ts"`), enabling hot module reloading without requiring intermediate package rebuilds during frontend feature development.
- **TypeScript Compiler**: `tsc` resolves types directly via `"types": "./src/index.ts"`.

---

## 3. Schemas and Inferred Types Exported

Exported through the single public barrel `packages/contracts/src/index.ts`:

### API Version Marker:

- `API_VERSION` (`'v1'`), `ApiVersion`

### Identifiers:

- `publicIdSchema`: UUID string validator.
- `PublicId`: `z.infer<typeof publicIdSchema>` (`string`)

### Pagination:

- `pageQueryParamSchema`: Coerced positive integer query parameter (defaults to 1).
- `pageSizeQueryParamSchema`: Coerced positive integer query parameter (max 100, defaults to 20).
- `paginationQuerySchema`: Standard page-based query input schema (`page`, `pageSize`, `q` trimmed up to 120 chars, strict).
- `paginationMetaSchema`: Collection pagination metadata (`page`, `pageSize`, `totalItems`, `totalPages`).
- `PaginationQueryInput`: `z.input<typeof paginationQuerySchema>`
- `PaginationQueryOutput` / `PaginationQuery`: `z.output<typeof paginationQuerySchema>`
- `PaginationMeta`: `z.infer<typeof paginationMetaSchema>`

### Envelopes:

- `createDataEnvelopeSchema(dataSchema)` (alias: `createSingleResourceResponseSchema`): Factory for `{ data: T }`.
- `createPaginatedEnvelopeSchema(itemSchema)` (alias: `createCollectionResponseSchema`): Factory for `{ data: T[], meta: { pagination: PaginationMeta } }`.
- `DataEnvelope<T>` / `SingleResourceResponse<T>`
- `PaginatedEnvelope<T>` / `CollectionResponse<T>`

### RFC 9457 Problem Details:

- `problemDetailErrorItemSchema`: Field-level validation error (`pointer`, `code`, `detail`).
- `problemDetailsSchema`: Standard problem details with extensions (`type`, `title`, `status`, `detail`, `instance`, `code`, `requestId`, `errors`).
- `ProblemDetailErrorItem`: `z.infer<typeof problemDetailErrorItemSchema>`
- `ProblemDetails`: `z.infer<typeof problemDetailsSchema>`

### Jobs Domain Contracts:

- `countryCodeSchema`: 2-letter uppercase ISO 3166-1 alpha-2 country code (`string`, normalized to uppercase).
- `JOB_SEARCH_SORT_VALUES`: Allowlist `['publishedAt:desc', 'publishedAt:asc', 'createdAt:desc', 'createdAt:asc']`.
- `jobSearchSortSchema`: `z.enum(JOB_SEARCH_SORT_VALUES)`.
- `jobSearchQuerySchema`: Representative public job search query contract with:
  - `page`, `pageSize`, `q` (pagination)
  - `countryCode`: uppercase ISO 3166-1 alpha-2
  - `city`: bounded string (1-100 chars)
  - `categoryId`: public UUID
  - `skillId`: single or repeated UUID filter normalized to `string[]`
  - `sort`: allowlisted sort enum
  - `.strict()`: rejects unknown fields
- `CountryCode`: `z.infer<typeof countryCodeSchema>`
- `JobSearchSort`: `z.infer<typeof jobSearchSortSchema>`
- `JobSearchQueryInput`: `z.input<typeof jobSearchQuerySchema>`
- `JobSearchQueryOutput` / `JobSearchQuery`: `z.output<typeof jobSearchQuerySchema>`

---

## 4. Consumer App Integration Locations

Both `@jmp/web` and `@jmp/api` consume the shared contracts via the workspace package name `@jmp/contracts`:

1. **API Consumer (`apps/api`)**:
   - Location: [apps/api/src/contracts.test.ts](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/api/src/contracts.test.ts)
   - Imports: `jobSearchQuerySchema`, `type JobSearchQueryInput`, `type JobSearchQueryOutput` from `@jmp/contracts`.
   - Tests: Simulates Express `req.query`, verifying default pagination (`page: 1`, `pageSize: 20`), repeated `skillId` normalization to `string[]`, UUID validation, bounds checking, parameter pollution rejection (`.strict()`), and uppercase country code normalization.
2. **Web Consumer (`apps/web`)**:
   - Location: [apps/web/src/contracts.test.ts](file:///Users/abcd/Documents/Devs/haile/projects/job-marketplace/apps/web/src/contracts.test.ts)
   - Imports: `jobSearchQuerySchema`, `type JobSearchQueryInput`, `type JobSearchQueryOutput`, `type DataEnvelope` from `@jmp/contracts`.
   - Tests: Verifies parsing and type inference from browser form state, invalid input rejection (excessive `pageSize`, invalid `countryCode`), and envelope typing without handwritten duplicate interfaces.

---

## 5. Production-Runtime Verification & Live Execution

### A. Direct Production Node Import Test:

Command:

```bash
node -e "import('@jmp/contracts').then(({ jobSearchQuerySchema, API_VERSION }) => console.log('API_VERSION:', API_VERSION, 'parse:', jobSearchQuerySchema.parse({ page: 2 })))"
```

Output:

```text
API_VERSION: v1 parse: { page: 2, pageSize: 20 }
```

(Exit code 0 — pure Node without tsx or loaders).

### B. Compiled API Production Startup & Live Endpoint Test:

Command:

```bash
PORT=3005 pnpm --filter @jmp/api start
curl -i http://localhost:3005/api/v1
```

Output:

```text
$ node dist/server.js
{"level":30,"msg":"Database connection established successfully"}
{"level":30,"port":3005,"msg":"Job Marketplace API listening on port 3005"}

HTTP/1.1 200 OK
X-Request-Id: 2908fffe-7363-4ec8-8b83-99a6541be8d1
Content-Type: application/json; charset=utf-8
Content-Length: 71

{"data":{"service":"Job Marketplace API","version":"v1","status":"ok"}}
```

(Exit code 0 — compiled API runs with production package exports and returns HTTP 200).

---

## 6. Monorepo Verification Matrix

All required verification commands executed cleanly with 100% pass rates:

| Command                                  | Status   | Details                                                                                         |
| ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `pnpm --filter @jmp/contracts lint`      | **PASS** | `eslint src --max-warnings=0` (0 errors, 0 warnings)                                            |
| `pnpm --filter @jmp/contracts typecheck` | **PASS** | `tsc --noEmit -p tsconfig.json` (0 type errors)                                                 |
| `pnpm --filter @jmp/contracts test`      | **PASS** | 3 test suites, 38 tests passed (`common.test.ts`, `job-search.test.ts`, `index.test.ts`)        |
| `pnpm --filter @jmp/contracts build`     | **PASS** | `tsc -p tsconfig.build.json` emitted valid JS, declaration files (`.d.ts`), and maps to `dist/` |
| `pnpm --filter @jmp/api typecheck`       | **PASS** | `tsc --noEmit -p tsconfig.json` (0 type errors)                                                 |
| `pnpm --filter @jmp/api test`            | **PASS** | 5 test suites, 29 tests passed (including `contracts.test.ts`)                                  |
| `pnpm --filter @jmp/api build`           | **PASS** | `pnpm db:generate && tsc -p tsconfig.build.json` succeeded cleanly                              |
| `pnpm --filter @jmp/web typecheck`       | **PASS** | `tsc --noEmit -p tsconfig.json` (0 type errors)                                                 |
| `pnpm --filter @jmp/web test`            | **PASS** | 4 test suites, 13 tests passed (including `contracts.test.ts`)                                  |
| `pnpm --filter @jmp/web build`           | **PASS** | `tsc --noEmit && vite build` built client bundle in 75ms                                        |
| `pnpm workspace:check`                   | **PASS** | All 4 workspace packages resolve cleanly with no missing dependencies                           |
| `pnpm check`                             | **PASS** | Full monorepo validation (lint, typecheck, test 100% green across all packages)                 |
