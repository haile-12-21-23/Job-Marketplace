/**
 * RFC 9457 Problem Details shape, extended with stable application fields.
 * https://www.rfc-editor.org/rfc/rfc9457
 */
export interface ProblemDetails {
  /** URI reference identifying the problem type. Use "about:blank" for generic HTTP errors. */
  type: string;
  /** Short human-readable summary of the problem type. */
  title: string;
  /** HTTP status code. */
  status: number;
  /** Human-readable explanation specific to this occurrence. */
  detail: string;
  /** URI reference identifying the specific occurrence (usually the request path). */
  instance: string;
  /** Stable machine-readable application error code. */
  code: string;
  /** Correlation ID from the request. */
  requestId: string | undefined;
}
