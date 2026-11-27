import { Router } from 'express';
import type { Request, Response } from 'express';
import { createV1Router, v1Router } from './v1/index.js';
import { createHealthRouter } from './health.js';
import { checkDatabaseReadiness } from '../infrastructure/database/prisma.js';
import type { AuthorizationContext, AuthorizationOptions } from '../modules/authorization/index.js';
import type { EmployerAccountsRouterOptions } from '../modules/employer-accounts/index.js';
import type { IdentityRouterOptions } from '../modules/identity/index.js';

export interface RootRouterOptions {
  checkDatabaseReadiness?: (() => Promise<void>) | undefined;
  corsOrigins?: ReadonlyArray<string> | undefined;
  identity?: IdentityRouterOptions | undefined;
  authorization?: AuthorizationOptions | undefined;
  employerAccounts?: Omit<EmployerAccountsRouterOptions, 'authorization'> | undefined;
  onMountV1Routes?: ((router: Router, authorization: AuthorizationContext) => void) | undefined;
}

export function createRootRouter(options?: RootRouterOptions): Router {
  const rootRouter: Router = Router();

  /**
   * GET /
   * Brief service metadata with a pointer to the versioned API base.
   * Does not expose environment variables, secrets, or filesystem details.
   */
  rootRouter.get('/', (_req: Request, res: Response): void => {
    res.json({
      service: 'Job Marketplace API',
      apiBase: '/api/v1',
    });
  });

  /** Mount operational health and readiness probes. */
  rootRouter.use(
    '/health',
    createHealthRouter({
      checkDatabaseReadiness: options?.checkDatabaseReadiness ?? checkDatabaseReadiness,
    }),
  );

  /** Mount version-prefixed product API. */
  const hasCustomV1Options =
    options?.identity !== undefined ||
    options?.corsOrigins !== undefined ||
    options?.authorization !== undefined ||
    options?.employerAccounts !== undefined ||
    options?.onMountV1Routes !== undefined;

  rootRouter.use(
    '/api/v1',
    hasCustomV1Options
      ? createV1Router({
          corsOrigins: options?.corsOrigins,
          identity: options?.identity,
          authorization: options?.authorization,
          employerAccounts: options?.employerAccounts,
          onMountRoutes: options?.onMountV1Routes,
        })
      : v1Router,
  );

  return rootRouter;
}

const rootRouter: Router = createRootRouter();

export { rootRouter };
