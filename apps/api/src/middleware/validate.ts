import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Express middleware factory: validates req.body against a Zod schema.
 * Replaces req.body with the sanitized/parsed data upon success.
 * Forwards ZodError to central errorHandler upon failure.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(result.error);
    }
    req.body = result.data;
    next();
  };
}
