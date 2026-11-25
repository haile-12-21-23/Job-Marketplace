import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ProblemDetailErrorItem } from '@jmp/contracts';
import { AppError } from '../errors/app-error.js';
import { logger } from '../observability/logger.js';
import type { ProblemDetails } from '../types/problem-details.js';

/**
 * Central Express error handler.
 * Must be the LAST middleware registered and must have exactly 4 parameters.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // If headers were already sent, we cannot write a new response.
  if (res.headersSent) {
    return;
  }

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let title = 'Internal Server Error';
  let detail = 'An unexpected error occurred. Please try again later.';
  let errors: ProblemDetailErrorItem[] | undefined;

  // ── Body-parser errors ──────────────────────────────────────────────────
  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      statusCode = 413;
      code = 'PAYLOAD_TOO_LARGE';
      title = 'Payload Too Large';
      detail = 'The request body exceeds the maximum allowed size.';
    } else {
      statusCode = 400;
      code = 'MALFORMED_JSON';
      title = 'Bad Request';
      detail = 'The request body contains malformed JSON.';
    }
    logger.warn({ requestId: req.requestId, code }, title);
  }

  // ── Zod validation errors ───────────────────────────────────────────────
  else if (err instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    title = 'Unprocessable Entity';
    detail = 'One or more fields are invalid.';
    errors = err.issues.map((issue) => {
      const pointer = issue.path.length > 0 ? `#/${issue.path.join('/')}` : '#';
      let issueCode = issue.code.toUpperCase();
      if (issue.code === 'custom') {
        issueCode = 'INVALID_INPUT';
      } else if (issue.code === 'unrecognized_keys') {
        issueCode = 'UNRECOGNIZED_KEYS';
      } else if (issue.code === 'invalid_type') {
        issueCode = 'INVALID_TYPE';
      } else if (issue.code === 'too_small') {
        issueCode = 'TOO_SMALL';
      } else if (issue.code === 'too_big') {
        issueCode = 'TOO_BIG';
      } else if (issue.code === 'invalid_string') {
        issueCode = 'INVALID_FORMAT';
      }
      return {
        pointer,
        code: issueCode,
        detail: issue.message,
      };
    });
    logger.warn({ requestId: req.requestId, code, statusCode, errors }, detail);
  }

  // ── Operational AppErrors ───────────────────────────────────────────────
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    title = httpStatusTitle(statusCode);
    detail = err.message;
    errors = err.errors;
    logger.warn({ requestId: req.requestId, code, statusCode, errors }, detail);
  }

  // ── Unknown / programming errors ────────────────────────────────────────
  else {
    // Log with full error context server-side; never expose internals to clients.
    logger.error({ requestId: req.requestId, err }, 'Unhandled error reached error handler');
  }

  const body: ProblemDetails = {
    type: 'about:blank',
    title,
    status: statusCode,
    detail,
    instance: req.path,
    code,
    requestId: req.requestId,
    ...(errors !== undefined && errors.length > 0 ? { errors } : {}),
  };

  res.status(statusCode).type('application/problem+json').json(body);
};

// ── Helpers ─────────────────────────────────────────────────────────────────

interface BodyParserError {
  type: string;
  status?: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as Record<string, unknown>)['type'] === 'string' &&
    ((err as Record<string, unknown>)['type'] === 'entity.parse.failed' ||
      (err as Record<string, unknown>)['type'] === 'entity.too.large')
  );
}

function httpStatusTitle(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    413: 'Payload Too Large',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return titles[status] ?? 'Error';
}
