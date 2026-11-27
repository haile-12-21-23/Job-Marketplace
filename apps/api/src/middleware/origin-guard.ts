import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error.js';

function toCanonicalHttpOrigin(rawOrigin: string): string | null {
  const trimmed = rawOrigin.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return null;
  }

  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    return null;
  }

  if (parsed.origin !== trimmed) {
    return null;
  }

  return parsed.origin;
}

/**
 * Enforces strict Origin allowlist and Fetch Metadata (`Sec-Fetch-Site`) validation
 * for cookie-authenticated POST endpoints (CSRF defense).
 */
export function createOriginGuardMiddleware(allowedOrigins: ReadonlyArray<string>): RequestHandler {
  const allowedOriginSet = new Set<string>();
  for (const origin of allowedOrigins) {
    const canonical = toCanonicalHttpOrigin(origin);
    if (canonical !== null) {
      allowedOriginSet.add(canonical);
    }
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    const rawFetchSite = req.headers['sec-fetch-site'];
    if (rawFetchSite !== undefined) {
      if (Array.isArray(rawFetchSite)) {
        next(new AppError(403, 'CSRF_ORIGIN_REJECTED', 'Cross-site requests are not allowed.'));
        return;
      }
      const normalizedFetchSite = rawFetchSite.trim().toLowerCase();
      if (normalizedFetchSite === 'cross-site') {
        next(new AppError(403, 'CSRF_ORIGIN_REJECTED', 'Cross-site requests are not allowed.'));
        return;
      }
    }

    const rawOrigin = req.headers['origin'];
    if (typeof rawOrigin !== 'string') {
      next(
        new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is required and must be allowed.'),
      );
      return;
    }

    const canonicalOrigin = toCanonicalHttpOrigin(rawOrigin);
    if (canonicalOrigin === null || !allowedOriginSet.has(canonicalOrigin)) {
      next(
        new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is required and must be allowed.'),
      );
      return;
    }

    next();
  };
}
