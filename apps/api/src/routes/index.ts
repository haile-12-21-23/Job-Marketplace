import { Router } from 'express';
import type { Request, Response } from 'express';
import { v1Router } from './v1/index.js';

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

/** Mount version-prefixed product API. */
rootRouter.use('/api/v1', v1Router);

export { rootRouter };
