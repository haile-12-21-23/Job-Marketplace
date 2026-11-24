import { Router } from 'express';
import { API_VERSION } from '@jmp/contracts';
import type { Request, Response } from 'express';

/**
 * Version-prefixed API router — all product endpoints mount here.
 * Future module routers (jobs, users, employers …) are registered in this file.
 */
const v1Router: Router = Router();

/**
 * GET /api/v1
 * Informational endpoint: confirms the API process and router are running.
 * Returns the standard success envelope { data: { ... } }.
 */
v1Router.get('/', (_req: Request, res: Response): void => {
  res.json({
    data: {
      service: 'Job Marketplace API',
      version: API_VERSION,
      status: 'ok',
    },
  });
});

export { v1Router };
