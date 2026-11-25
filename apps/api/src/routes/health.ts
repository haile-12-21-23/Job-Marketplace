import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import { logger } from '../observability/logger.js';

export interface HealthRouterOptions {
  checkDatabaseReadiness?: (() => Promise<void>) | undefined;
}

/**
 * Creates the operational health router.
 *
 * Endpoints:
 * - GET /health       - General service status & timestamp (no database dependency)
 * - GET /health/live  - Liveness probe for process orchestrators (no database dependency)
 * - GET /health/ready - Readiness probe checking database connectivity
 */
export function createHealthRouter(options?: HealthRouterOptions): Router {
  const router = Router();
  const checkReadiness = options?.checkDatabaseReadiness;

  // ── GET /health ───────────────────────────────────────────────────────────
  router.get('/', (_req: Request, res: Response): void => {
    res.json({
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ── GET /health/live ──────────────────────────────────────────────────────
  router.get('/live', (_req: Request, res: Response): void => {
    res.json({
      data: {
        status: 'ok',
      },
    });
  });

  // ── GET /health/ready ─────────────────────────────────────────────────────
  router.get('/ready', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (checkReadiness) {
        await checkReadiness();
      }
      res.json({
        data: {
          status: 'ready',
        },
      });
    } catch (err) {
      // Never expose driver error details, database credentials, or stack traces.
      logger.warn(
        {
          requestId: req.requestId,
          err: err instanceof Error ? err.message : 'Database readiness check failed',
        },
        'Readiness probe failed — database is unavailable',
      );

      next(new AppError(503, 'SERVICE_NOT_READY', 'Service is not ready to accept traffic'));
    }
  });

  return router;
}
