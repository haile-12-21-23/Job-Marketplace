import { Router } from 'express';
import type { Request, Response } from 'express';
import { createV1Router, v1Router } from './v1/index.js';
import { createHealthRouter } from './health.js';
import { checkDatabaseReadiness } from '../infrastructure/database/prisma.js';
import type { IdentityRouterOptions } from '../modules/identity/index.js';

export interface RootRouterOptions {
  checkDatabaseReadiness?: (() => Promise<void>) | undefined;
  identity?: IdentityRouterOptions | undefined;
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
  rootRouter.use(
    '/api/v1',
    options?.identity ? createV1Router({ identity: options.identity }) : v1Router,
  );

  return rootRouter;
}

const rootRouter: Router = createRootRouter();

export { rootRouter };
