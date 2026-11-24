import type { Request, Response } from 'express';
import type { ProblemDetails } from '../types/problem-details.js';

/** Catch-all 404 handler — must be registered after all real routes. */
export function notFound(req: Request, res: Response): void {
  const body: ProblemDetails = {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'The requested route was not found.',
    instance: req.path,
    code: 'ROUTE_NOT_FOUND',
    requestId: req.requestId,
  };
  res.status(404).type('application/problem+json').json(body);
}
