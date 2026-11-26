import type { ProblemDetailErrorItem } from '@jmp/contracts';

/**
 * AppError — typed domain error for expected HTTP error responses.
 *
 * Carry a stable machine-readable `code`, an HTTP `statusCode`, and a safe
 * public `message`. Never store raw database errors or stack traces in `message`.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly errors?: ProblemDetailErrorItem[] | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    isOperational = true,
    errors?: ProblemDetailErrorItem[] | undefined,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.errors = errors;
    // Restore prototype chain (required when extending built-ins in TypeScript)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
