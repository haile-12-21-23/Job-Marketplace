# @jmp/contracts — Shared Zod Contracts

Browser-safe, shared Zod request and response contracts for the Job Marketplace platform.

## Purpose & Scope Boundaries

`@jmp/contracts` is the single source of truth for public API shapes consumed by both `@jmp/web` (React/Vite) and `@jmp/api` (Express/Node.js).

### Browser-Safe Boundary
- **Never import**: Prisma Client, database drivers (`pg`), Express, Node.js built-in modules (`fs`, `path`, etc.), environment variables, secrets, or server-only authorization logic into this package.
- Public DTOs describe the HTTP API boundary as consumed by web and future mobile clients. They must never directly mirror internal Prisma models or database sequential IDs.

## Consuming Contracts

Both `@jmp/web` and `@jmp/api` import schemas and inferred types directly from the package namespace:

```ts
import {
  jobSearchQuerySchema,
  type JobSearchQueryInput,
  type JobSearchQueryOutput,
  type DataEnvelope,
  type PaginatedEnvelope,
  type ProblemDetails,
} from '@jmp/contracts';
```

### TypeScript Types: Inferred vs. Handwritten

All TypeScript interfaces must be inferred directly from Zod schemas:
- `z.input<typeof schema>` (e.g. `JobSearchQueryInput`): Represents raw, unparsed client input (such as Express `req.query` strings or browser form state).
- `z.output<typeof schema>` / `z.infer<typeof schema>` (e.g. `JobSearchQueryOutput`): Represents validated, parsed, and coerced output data with defaults applied.

Do not write duplicate TypeScript interfaces for schemas defined in this package.

## Adding New Request / Response DTOs

1. Create a module under `src/<domain>/` (e.g. `src/jobs/`, `src/applications/`).
2. Define Zod schemas using standard primitive validators:
   - Use `publicIdSchema` for opaque UUID primary/foreign keys.
   - Use `.strict()` on request/write schemas to reject unexpected or malicious properties.
   - For response schemas, avoid `.strict()` so forward-compatible clients can safely ignore additive fields.
3. Export schemas and inferred types (`z.input`, `z.output`).
4. Re-export through the single public barrel: `src/index.ts`.
5. Keep DTOs strictly independent of Prisma schema definitions.

## Package Scripts

Run from the monorepo root:

| Command | Description |
|---|---|
| `pnpm --filter @jmp/contracts build` | Compile TypeScript and emit `.js` and `.d.ts` declarations to `dist/` |
| `pnpm --filter @jmp/contracts typecheck` | Run strict TypeScript compiler verification without emitting |
| `pnpm --filter @jmp/contracts lint` | Lint contract source files with ESLint |
| `pnpm --filter @jmp/contracts test` | Run unit tests with Vitest |

## API Versioning & Compatibility

- All current endpoints target the `/api/v1` base route.
- The `API_VERSION` constant (`'v1'`) provides a stable runtime marker.
- Additive, non-breaking fields are permitted within `v1`. Breaking changes require a major version increment (`/api/v2`).
