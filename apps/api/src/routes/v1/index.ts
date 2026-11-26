import { Router } from 'express';
import { API_VERSION } from '@jmp/contracts';
import type { Request, Response } from 'express';
import { createIdentityRouter, type IdentityRouterOptions } from '../../modules/identity/index.js';

export interface V1RouterOptions {
  identity?: IdentityRouterOptions | undefined;
}

export function createV1Router(options?: V1RouterOptions): Router {
  const router: Router = Router();

  /**
   * GET /api/v1
   * Informational endpoint: confirms the API process and router are running.
   * Returns the standard success envelope { data: { ... } }.
   */
  router.get('/', (_req: Request, res: Response): void => {
    res.json({
      data: {
        service: 'Job Marketplace API',
        version: API_VERSION,
        status: 'ok',
      },
    });
  });

  /**
   * POST /api/v1/auth/register
   * POST /api/v1/auth/verify-email
   * POST /api/v1/auth/resend-verification
   * POST /api/v1/auth/login
   * Mount auth domain routes under /auth.
   */
  router.use('/auth', createIdentityRouter(options?.identity));

  return router;
}

const v1Router: Router = createV1Router();

export { v1Router };
