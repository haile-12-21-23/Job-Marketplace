# JMP-28 - Shared Zod Contracts Package

**Project:** Job Marketplace & Recruitment Platform  
**Jira:** JMP-28 - Create shared Zod contracts package  
**Sprint:** Sprint 1 - Project Foundation  
**Package:** `@jmp/contracts`  
**Assignee:** Current Jira assignee  

## 1. Objective

Implement the shared, browser-safe Zod contract package used by both `@jmp/web` and `@jmp/api`. The schemas are the source of truth for shared public request/response shapes; TypeScript types must be inferred from those schemas rather than maintained as duplicate interfaces.

Keep public API DTOs separate from Prisma-generated models. The contracts package must not import Prisma, Express, Node.js built-ins, database code, environment variables, secrets, or server-only authorization policy.

## 2. Read project references first

Before editing, inspect the repository and current working tree:

1. Run `git status --short` and inspect the root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, TypeScript configs and package scripts.
2. Inspect `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, current `src/index.ts` and its placeholder test.
3. Inspect `apps/web` and `apps/api` package manifests, TS/Vitest configs, and the existing `@jmp/contracts` imports.
4. Read the repository copies of:
   - `docs/standards/JMP_API_Standards_v1.0.pdf`
   - `docs/architecture/JMP_Architecture_Design_v1.0.pdf` (or the actual architecture document location)
   - `docs/requirements/JMP_SRS_v1.0.pdf`
   - `docs/data/JMP_ERD_v1.0.pdf` (or the actual ERD document location)
5. If documents use different locations or filenames, locate them and report the actual paths. Do not create duplicate reference copies unnecessarily.

Treat the API Standards as normative for public payloads, pagination, field naming, API versioning and Problem Details. Treat the SRS and ERD as authoritative for product/domain meaning. Do not infer public API contracts directly from Prisma model shape.

## 3. Existing architecture and compatibility

- Preserve the pnpm monorepo and existing package names: `@jmp/contracts`, `@jmp/web`, `@jmp/api`, `@jmp/config`.
- Preserve strict TypeScript, ESM and NodeNext conventions.
- `@jmp/contracts` is a private workspace package consumed by the React/Vite app and Express/TypeScript API.
- The current starter package exports TypeScript source from `src/index.ts`. Inspect how the real repository resolves workspace source before changing its export strategy. Keep the source-workspace approach if it is already working in Vite and Node/tsx; do not introduce a package-resolution change that forces consumers to import unpublished build output.
- Use the existing pnpm lockfile/catalog conventions. Do not independently install different Zod versions in the web and API apps. Prefer a single Zod runtime dependency owned by `@jmp/contracts`, with both apps consuming the exported schemas/types.
- Do not upgrade TypeScript, Vite, Express, Prisma or other unrelated dependencies.

## 4. Contract package design

Create a clear and maintainable layout under `packages/contracts/src/`. A suggested organization is:

```text
packages/contracts/
  src/
    common/
      identifiers.ts
      pagination.ts
      envelopes.ts
      problem-details.ts
      common.test.ts
    jobs/
      job-search.ts
      job-search.test.ts
    index.ts
```

Adjust names if the repository already has an established convention. Keep modules small and avoid one giant schema file.

### 4.1 Zod dependency and package configuration

- Add Zod as a runtime dependency of `@jmp/contracts`.
- Use the compatible stable version already present in the lockfile/catalog if one exists; otherwise select a current stable release compatible with the repository's TypeScript/toolchain and record the resolved version in `pnpm-lock.yaml`.
- Do not install a separate Zod dependency in both apps merely to consume the package's schemas.
- Ensure `@jmp/contracts` has a real `build` script that emits JavaScript and declaration files into `dist/` using a dedicated `tsconfig.build.json` (or the repository's established build pattern). Do not silently call a no-emit typecheck a build.
- Preserve the existing workspace source export behavior if required for Vite/tsx development. Document the source-export choice; ensure generated `dist/` is ignored and not committed unless this repo deliberately tracks build artifacts.
- Ensure the package `exports`, `types`, `files` and scripts remain coherent with the actual source/build strategy. Do not point consumers at missing files.

### 4.2 Common identifier contract

Add a public opaque-ID schema matching the API Standards:

- Public identifiers are UUID strings; never expose Prisma sequential IDs.
- Export the schema and inferred type, for example `publicIdSchema` and `PublicId`.
- Use a Zod API supported by the selected installed version.

### 4.3 Standard pagination contracts

Implement the standard page-based query and metadata schemas from `JMP_API_Standards_v1.0`.

**Pagination query input:**
- `page`: positive integer, default `1`.
- `pageSize`: positive integer, default `20`, maximum `100`.
- `q`: optional trimmed search phrase, maximum `120` characters.
- Unknown query properties should be rejected for this initial explicit query schema.

**Pagination output metadata:**
- `page`: positive integer.
- `pageSize`: positive integer, maximum `100`.
- `totalItems`: non-negative integer.
- `totalPages`: non-negative integer; allow `0` when a filtered collection is empty.

Export inferred input/output types. Because defaults and coercion can make Zod input and output types differ, use `z.input<typeof schema>` for raw query inputs and `z.output<typeof schema>` (or `z.infer`) for parsed values where appropriate. Do not write a duplicate interface for either shape.

Use Zod coercion carefully for URL query strings. Validate empty/malformed strings instead of silently converting them into valid page values. Keep single-value query parameters as single values unless a field is explicitly documented as a repeated/multi-value filter.

### 4.4 Success envelopes

Implement reusable schema factories for the API Standards response shapes:

- Single resource: `{ data: T }`.
- Collection: `{ data: T[], meta: { pagination: PaginationMeta } }`.

Prefer generic schema factory functions that accept the item/data schema. Keep the inferred result precise so the frontend and backend can use it without handwritten response interfaces. Do not add `data: null` for HTTP 204 responses; 204 has no response body and does not need a JSON envelope schema.

### 4.5 RFC 9457 Problem Details

Implement a shared public schema for the API error representation, including the standard members and the API Standards extensions:

- `type`, `title`, `status` (integer HTTP error status), optional `detail`, optional `instance`.
- `code`: stable machine-readable application error code.
- `requestId`: correlation ID string.
- optional `errors`: array of field-level issues with `pointer`, `code`, and safe user-facing `detail`.

Use public-safe strings only. The schema must not include stack traces, SQL/database errors, tokens, private resume content, verification evidence keys or internal moderation notes. Do not encode a fixed exhaustive error-code enum yet; error codes can expand as API modules are implemented. A generic string code maintains forward compatibility.

### 4.6 Representative job-search query contract

Add one small representative domain query contract to prove that product-specific query shapes can be shared. Base it on the job-search query section of the API Standards and the SRS/ERD. Include only agreed, public, first-release query fields that can be safely implemented now:

- `page`, `pageSize`, `q` from the shared pagination query.
- `countryCode` as an uppercase ISO 3166-1 alpha-2 code when supplied.
- `city` as a trimmed, bounded optional string.
- `categoryId` as a public UUID when supplied.
- `skillId` as a repeated/multi-value public UUID filter when supplied; accept the actual Express query-parser representation for one or multiple values, then normalize to a consistent array.
- `sort` only if the API Standards/SRS and current product decisions support a defined allowlist. Do not accept arbitrary sort field names or Prisma order expressions. Document the chosen public values.

If the actual SRS names or constraints differ, use the documents rather than the suggested names above. Do not invent enum members for employment type, work arrangement, salary period, job status or application status. Those public enums must be agreed against the SRS and lifecycle model before adding them.

Export the schema and inferred input/output types. This representative schema is a contract example, not an implementation of the job-search endpoint.

## 5. DTO and domain boundaries

- Public DTOs describe the API as consumed by web and future mobile clients; they are not Prisma models and must not mirror every database field.
- Never import from `apps/api/src/generated/prisma`, `@prisma/client`, Prisma schema files or database packages in `@jmp/contracts`.
- Do not export internal database IDs, password hashes, refresh-token hashes, verification-document object keys, internal notes, audit internals or server-only permission logic.
- Use camelCase JSON property names. Use stable, documented public strings for any enum. Use ISO 8601 UTC timestamp strings in public response contracts when timestamps are introduced.
- Money, where later contracts need it, must use the API Standards representation (decimal string plus ISO 4217 currency code and period); do not expose Prisma `Decimal` instances.
- Use `.strict()` (or the equivalent supported by the chosen Zod version) on request/write object schemas where unknown properties must be rejected. Do not make response parsing unnecessarily strict if forward-compatible clients are expected to ignore additive response fields; make and document the distinction deliberately.

## 6. Exports and inferred TypeScript types

- Keep `packages/contracts/src/index.ts` as the single public barrel.
- Export schemas, helper factories and inferred public types from the barrel.
- Export types with `z.infer`, `z.input` and `z.output` rather than duplicating interfaces.
- Preserve `API_VERSION` and `ApiVersion` if they already exist; extend rather than break existing exports.
- Use explicit `.js` relative import specifiers where required by NodeNext ESM conventions.
- Do not expose internal helper modules as undocumented package subpaths unless the existing package export strategy requires them.

## 7. Consume contracts from both applications

The acceptance criterion requires actual imports from both apps, not merely a dependency in `package.json`.

### API (`apps/api`)

- Add `@jmp/contracts` imports in a focused test or existing request validation test.
- Validate a representative raw query using the shared schema and assert the parsed defaults/normalized output.
- Validate malformed UUID, page/pageSize bounds, unknown query key, and repeated `skillId` behavior.
- Keep Prisma and server-only policy out of the contract tests.
- Do not refactor the global Express error handler or add route validation middleware unless the existing code clearly requires a minimal integration. Full endpoint adoption belongs with endpoint implementation work.

### Web (`apps/web`)

- Import the exact same `jobSearchQuerySchema` (or an appropriate shared schema) from `@jmp/contracts` in a focused Vitest test.
- Verify a valid browser form/query payload parses and invalid input is rejected.
- Demonstrate use of an inferred exported type in test or existing UI typing without creating a duplicate interface.
- Do not build the job search screen or API client in this ticket.

Both tests must import from the public package name `@jmp/contracts`, not from a relative path into `packages/contracts/src`.

## 8. Testing requirements

Add meaningful tests for at least:

1. Pagination defaults (`page=1`, `pageSize=20`).
2. Accepted page and pageSize values.
3. Rejection of zero/negative/non-integer values and `pageSize > 100`.
4. Search phrase trimming and 120-character maximum.
5. Rejection of unknown query fields.
6. UUID validation for public IDs and category/skill filters.
7. Repeated skill IDs normalized consistently for one and multiple values.
8. Pagination metadata with zero results and a normal result set.
9. Single-resource and collection envelope factories.
10. Problem Details with optional field errors and required stable code/requestId.
11. API app consumes the exported query schema.
12. Web app consumes the same exported query schema.

Keep tests deterministic. Do not require a running PostgreSQL database for contract tests.

## 9. Documentation

Update `packages/contracts/README.md` (or the package documentation convention already used) with:

- Purpose and browser-safe boundary.
- How web/API import schemas and inferred types.
- How to add a request/response DTO without coupling it to Prisma.
- Difference between `z.input` and parsed `z.output` for coercion/defaults.
- Package build/test/typecheck commands.
- Naming/versioning and compatibility notes for `/api/v1`.

Do not duplicate the entire API Standards document.

## 10. Explicitly out of scope

Do not implement or redesign:

- Authentication/authorization schemas or auth flows (Sprint 2).
- Full job/employer/application CRUD schemas and routes; add those with the relevant feature stories after domain requirements are finalized.
- API endpoint implementation or Express validation middleware globally.
- OpenAPI generation, Swagger UI, route registry or zod-to-openapi integration; follow the separate API documentation implementation plan if scheduled.
- Prisma model/schema changes, database migrations, SQL constraints or generated Prisma client changes (JMP-27 is Done).
- Centralized environment configuration/validation and toolchain cleanup (JMP-29).
- Docker Compose and health/readiness probes (JMP-31).
- GitHub Actions/CI workflows (JMP-32).
- UI routing, Redux state or RTK Query endpoints (JMP-30).

## 11. Required verification

Run the commands supported by the repository and include their exact results in the handoff:

```bash
pnpm --filter @jmp/contracts lint
pnpm --filter @jmp/contracts typecheck
pnpm --filter @jmp/contracts test
pnpm --filter @jmp/contracts build
pnpm --filter @jmp/api typecheck
pnpm --filter @jmp/api test
pnpm --filter @jmp/web typecheck
pnpm --filter @jmp/web test
pnpm workspace:check
pnpm check
```

Also confirm:

- Both `@jmp/api` and `@jmp/web` import the same public schema from `@jmp/contracts`.
- A clean package build emits valid JavaScript and `.d.ts` output.
- No duplicated request/response interfaces were introduced for schemas represented in the package.
- No Prisma, Express or Node-only dependency leaked into the contracts package.
- Existing `pnpm check` remains green.

If any command fails, diagnose and fix it within JMP-28 scope where possible. Do not suppress errors with `--passWithNoTests`, `any`, `@ts-ignore`, disabled lint rules or weakened compiler settings.

## 12. Handoff report

At completion, provide:

1. Files created/changed and the final contract package structure.
2. Zod version used and package export/build strategy.
3. Schemas and inferred types exported.
4. Exact frontend and backend import locations proving both apps consume the package.
5. Test cases/results for the contracts package and both consuming apps.
6. Exact verification command output/status.
7. Any deliberate deviations from API Standards/SRS and why.
8. Confirmation that out-of-scope Jira issues were not pulled into this change.

Do not claim JMP-28 complete until all four Jira acceptance criteria are demonstrably satisfied.
