import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/** Maximum byte length accepted for an echoed X-Request-Id value. */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Pattern that an incoming X-Request-Id must fully match to be echoed.
 * Allows UUIDs, hex strings, and simple alphanumeric+hyphen/underscore ids.
 * Rejects anything that looks like injection or base64 with unsafe chars.
 */
const SAFE_REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;

/** Middleware: assign a request correlation ID and attach it to the response. */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;

  const id =
    typeof raw === 'string' &&
    raw.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID_PATTERN.test(raw)
      ? raw
      : randomUUID();

  // Expose the ID on the request object for downstream handlers and loggers.
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
