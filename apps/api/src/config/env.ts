import { z } from 'zod';

/**
 * Custom error thrown when environment validation fails.
 * Guarantees zero credential, URL, or secret exposure.
 */
export class EnvironmentValidationError extends Error {
  public readonly issues: ReadonlyArray<{ field: string; message: string }>;

  constructor(issues: Array<{ field: string; message: string }>) {
    const summary = issues.map((i) => `  - ${i.field}: ${i.message}`).join('\n');
    super(`Environment validation failed:\n${summary}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

/**
 * Validates database URL without echoing raw URL, password, or credentials in error messages.
 */
const databaseUrlSchema = z
  .string({
    required_error: 'DATABASE_URL is required',
    invalid_type_error: 'DATABASE_URL must be a string',
  })
  .trim()
  .min(1, 'DATABASE_URL cannot be empty')
  .superRefine((val, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(val);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL is malformed. Expected a valid postgresql:// or postgres:// URL',
      });
      return;
    }

    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `DATABASE_URL has invalid protocol "${protocol}". Expected postgresql: or postgres:`,
      });
    }

    if (!parsed.hostname || parsed.hostname.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL is missing a host name',
      });
    }

    const databaseName = parsed.pathname.replace(/^\//, '').trim();
    if (!databaseName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL is missing a database name in the path',
      });
    }
  });

/**
 * Validates and normalizes CORS_ORIGINS as a comma-separated string into a string array.
 */
const corsOriginsSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .default('http://localhost:5173')
  .transform((val, ctx) => {
    const rawList = Array.isArray(val) ? val : val.split(',');
    const origins = rawList.map((o) => o.trim()).filter(Boolean);
    if (origins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGINS must contain at least one valid origin',
      });
      return ['http://localhost:5173'];
    }
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'CORS_ORIGINS must use http: or https: scheme',
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CORS_ORIGINS contains an invalid origin URL format',
        });
      }
    }
    return origins;
  });

/**
 * Validates TCP port number within 1-65535, defaulting to 3000.
 */
const portSchema = z
  .union([z.number(), z.string()])
  .optional()
  .default(3000)
  .pipe(
    z.coerce
      .number({ invalid_type_error: 'PORT must be a valid number' })
      .int('PORT must be an integer')
      .min(1, 'PORT must be between 1 and 65535')
      .max(65535, 'PORT must be between 1 and 65535'),
  );

/**
 * Validates NODE_ENV environment mode.
 */
const nodeEnvSchema = z
  .enum(['development', 'test', 'production'], {
    errorMap: () => ({
      message: 'NODE_ENV must be one of: development, test, production',
    }),
  })
  .default('development');

/**
 * Validates LOG_LEVEL for Pino structured logging.
 */
const logLevelSchema = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
    errorMap: () => ({
      message: 'LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace, silent',
    }),
  })
  .default('info');

/**
 * Validates an HTTP(S) URL and strips trailing slashes.
 */
function httpUrlSchema(fieldName: string) {
  return z
    .string({ invalid_type_error: `${fieldName} must be a string` })
    .trim()
    .min(1, `${fieldName} cannot be empty`)
    .superRefine((val, ctx) => {
      try {
        const parsed = new URL(val);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${fieldName} must use http: or https: scheme`,
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${fieldName} must be a valid URL`,
        });
      }
    })
    .transform((val) => val.replace(/\/+$/, ''));
}

function positiveIntSchema(fieldName: string, defaultValue: number, min: number, max: number) {
  return z
    .union([z.number(), z.string()])
    .optional()
    .default(defaultValue)
    .pipe(
      z.coerce
        .number({ invalid_type_error: `${fieldName} must be a valid number` })
        .int(`${fieldName} must be an integer`)
        .min(min, `${fieldName} must be between ${min} and ${max}`)
        .max(max, `${fieldName} must be between ${min} and ${max}`),
    );
}

const emailProviderSchema = z
  .enum(['development', 'http'], {
    errorMap: () => ({
      message: 'EMAIL_PROVIDER must be one of: development, http',
    }),
  })
  .default('development');

const emailFromSchema = z
  .string({ invalid_type_error: 'EMAIL_FROM must be a string' })
  .trim()
  .email('EMAIL_FROM must be a valid email address')
  .default('no-reply@jobmarketplace.local');

const accessTokenSecretSchema = z
  .string({
    required_error: 'AUTH_ACCESS_TOKEN_SECRET is required',
    invalid_type_error: 'AUTH_ACCESS_TOKEN_SECRET must be a string',
  })
  .trim()
  .min(32, 'AUTH_ACCESS_TOKEN_SECRET must be at least 32 characters');

const nonEmptyLabelSchema = (fieldName: string, defaultValue: string) =>
  z
    .string({ invalid_type_error: `${fieldName} must be a string` })
    .trim()
    .min(1, `${fieldName} cannot be empty`)
    .default(defaultValue);

const refreshCookieSameSiteSchema = z
  .enum(['lax', 'strict', 'none'], {
    errorMap: () => ({
      message: 'AUTH_REFRESH_COOKIE_SAME_SITE must be one of: lax, strict, none',
    }),
  })
  .default('lax');

const trustProxySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])], {
    errorMap: () => ({
      message: 'TRUST_PROXY must be a boolean or "true"/"false"',
    }),
  })
  .optional()
  .default(false)
  .transform((val) => val === true || val === 'true');

/**
 * Centralized environment schema for @jmp/api.
 */
export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema,
    DATABASE_URL: databaseUrlSchema,
    CORS_ORIGINS: corsOriginsSchema,
    LOG_LEVEL: logLevelSchema,
    APP_WEB_URL: httpUrlSchema('APP_WEB_URL').optional().default('http://localhost:5173'),
    EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: positiveIntSchema(
      'EMAIL_VERIFICATION_TOKEN_TTL_MINUTES',
      60,
      5,
      10080,
    ),
    EMAIL_VERIFICATION_RESEND_IP_MAX: positiveIntSchema(
      'EMAIL_VERIFICATION_RESEND_IP_MAX',
      10,
      1,
      1000,
    ),
    EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS: positiveIntSchema(
      'EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS',
      900,
      1,
      86400,
    ),
    EMAIL_VERIFICATION_RESEND_EMAIL_MAX: positiveIntSchema(
      'EMAIL_VERIFICATION_RESEND_EMAIL_MAX',
      3,
      1,
      100,
    ),
    EMAIL_VERIFICATION_RESEND_EMAIL_WINDOW_SECONDS: positiveIntSchema(
      'EMAIL_VERIFICATION_RESEND_EMAIL_WINDOW_SECONDS',
      900,
      1,
      86400,
    ),
    EMAIL_PROVIDER: emailProviderSchema,
    EMAIL_FROM: emailFromSchema,
    EMAIL_HTTP_ENDPOINT: httpUrlSchema('EMAIL_HTTP_ENDPOINT').optional(),
    EMAIL_HTTP_API_KEY: z
      .string({ invalid_type_error: 'EMAIL_HTTP_API_KEY must be a string' })
      .trim()
      .optional(),
    AUTH_ACCESS_TOKEN_SECRET: accessTokenSecretSchema,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: positiveIntSchema(
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      900,
      60,
      3600,
    ),
    AUTH_ACCESS_TOKEN_ISSUER: nonEmptyLabelSchema(
      'AUTH_ACCESS_TOKEN_ISSUER',
      'job-marketplace-api',
    ),
    AUTH_ACCESS_TOKEN_AUDIENCE: nonEmptyLabelSchema(
      'AUTH_ACCESS_TOKEN_AUDIENCE',
      'job-marketplace-web',
    ),
    AUTH_REFRESH_TOKEN_TTL_DAYS: positiveIntSchema('AUTH_REFRESH_TOKEN_TTL_DAYS', 30, 1, 90),
    AUTH_REFRESH_COOKIE_SAME_SITE: refreshCookieSameSiteSchema,
    AUTH_LOGIN_RATE_LIMIT_IP_MAX: positiveIntSchema('AUTH_LOGIN_RATE_LIMIT_IP_MAX', 10, 1, 1000),
    AUTH_LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS: positiveIntSchema(
      'AUTH_LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS',
      900,
      1,
      86400,
    ),
    AUTH_LOGIN_RATE_LIMIT_EMAIL_MAX: positiveIntSchema(
      'AUTH_LOGIN_RATE_LIMIT_EMAIL_MAX',
      5,
      1,
      100,
    ),
    AUTH_LOGIN_RATE_LIMIT_EMAIL_WINDOW_SECONDS: positiveIntSchema(
      'AUTH_LOGIN_RATE_LIMIT_EMAIL_WINDOW_SECONDS',
      900,
      1,
      86400,
    ),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: positiveIntSchema(
      'PASSWORD_RESET_TOKEN_TTL_MINUTES',
      30,
      5,
      1440,
    ),
    PASSWORD_RESET_RATE_LIMIT_IP_MAX: positiveIntSchema(
      'PASSWORD_RESET_RATE_LIMIT_IP_MAX',
      10,
      1,
      1000,
    ),
    PASSWORD_RESET_RATE_LIMIT_IP_WINDOW_SECONDS: positiveIntSchema(
      'PASSWORD_RESET_RATE_LIMIT_IP_WINDOW_SECONDS',
      900,
      1,
      86400,
    ),
    PASSWORD_RESET_RATE_LIMIT_EMAIL_MAX: positiveIntSchema(
      'PASSWORD_RESET_RATE_LIMIT_EMAIL_MAX',
      3,
      1,
      100,
    ),
    PASSWORD_RESET_RATE_LIMIT_EMAIL_WINDOW_SECONDS: positiveIntSchema(
      'PASSWORD_RESET_RATE_LIMIT_EMAIL_WINDOW_SECONDS',
      900,
      1,
      86400,
    ),
    TRUST_PROXY: trustProxySchema,
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.EMAIL_PROVIDER !== 'http') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_PROVIDER'],
          message:
            'EMAIL_PROVIDER must be "http" in production (the development email adapter is not allowed in production)',
        });
      }

      if (new URL(data.APP_WEB_URL).protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_WEB_URL'],
          message: 'APP_WEB_URL must use https: scheme in production',
        });
      }

      if (data.EMAIL_HTTP_ENDPOINT && new URL(data.EMAIL_HTTP_ENDPOINT).protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_HTTP_ENDPOINT'],
          message: 'EMAIL_HTTP_ENDPOINT must use https: scheme in production',
        });
      }
    }

    if (
      data.AUTH_REFRESH_COOKIE_SAME_SITE === 'none' &&
      (data.NODE_ENV !== 'production' || new URL(data.APP_WEB_URL).protocol !== 'https:')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_REFRESH_COOKIE_SAME_SITE'],
        message:
          'AUTH_REFRESH_COOKIE_SAME_SITE="none" requires NODE_ENV="production" with Secure=true and an https: APP_WEB_URL',
      });
    }

    if (data.EMAIL_PROVIDER === 'http') {
      if (!data.EMAIL_HTTP_ENDPOINT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_HTTP_ENDPOINT'],
          message: 'EMAIL_HTTP_ENDPOINT is required when EMAIL_PROVIDER is "http"',
        });
      }
      if (!data.EMAIL_HTTP_API_KEY || data.EMAIL_HTTP_API_KEY.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_HTTP_API_KEY'],
          message: 'EMAIL_HTTP_API_KEY is required when EMAIL_PROVIDER is "http"',
        });
      }
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export interface ApiConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  appWebUrl: string;
  emailVerificationTokenTtlMinutes: number;
  emailVerificationResendIpMax: number;
  emailVerificationResendIpWindowSeconds: number;
  emailVerificationResendEmailMax: number;
  emailVerificationResendEmailWindowSeconds: number;
  emailProvider: 'development' | 'http';
  emailFrom: string;
  emailHttpEndpoint?: string | undefined;
  emailHttpApiKey?: string | undefined;
  authAccessTokenSecret: string;
  authAccessTokenTtlSeconds: number;
  authAccessTokenIssuer: string;
  authAccessTokenAudience: string;
  authRefreshTokenTtlDays: number;
  authRefreshCookieSameSite: 'lax' | 'strict' | 'none';
  authLoginRateLimitIpMax: number;
  authLoginRateLimitIpWindowSeconds: number;
  authLoginRateLimitEmailMax: number;
  authLoginRateLimitEmailWindowSeconds: number;
  passwordResetTokenTtlMinutes: number;
  passwordResetRateLimitIpMax: number;
  passwordResetRateLimitIpWindowSeconds: number;
  passwordResetRateLimitEmailMax: number;
  passwordResetRateLimitEmailWindowSeconds: number;
  trustProxy: boolean;
}

/**
 * Validates only database configuration for DB-only tooling and integration tests.
 */
export function loadDatabaseConfig(source: Record<string, string | undefined> = process.env): {
  databaseUrl: string;
} {
  const result = z.object({ DATABASE_URL: databaseUrlSchema }).safeParse(source);
  if (!result.success) {
    const issues = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw new EnvironmentValidationError(issues);
  }
  return { databaseUrl: result.data.DATABASE_URL };
}

/**
 * Parses and validates environment variables.
 *
 * @param source Optional dictionary of environment variables (defaults to process.env).
 * @returns Fully validated and typed ApiConfig.
 * @throws {EnvironmentValidationError} When validation fails, with sanitized error messages.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): ApiConfig {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw new EnvironmentValidationError(issues);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    corsOrigins: result.data.CORS_ORIGINS,
    logLevel: result.data.LOG_LEVEL,
    appWebUrl: result.data.APP_WEB_URL,
    emailVerificationTokenTtlMinutes: result.data.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES,
    emailVerificationResendIpMax: result.data.EMAIL_VERIFICATION_RESEND_IP_MAX,
    emailVerificationResendIpWindowSeconds: result.data.EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS,
    emailVerificationResendEmailMax: result.data.EMAIL_VERIFICATION_RESEND_EMAIL_MAX,
    emailVerificationResendEmailWindowSeconds:
      result.data.EMAIL_VERIFICATION_RESEND_EMAIL_WINDOW_SECONDS,
    emailProvider: result.data.EMAIL_PROVIDER,
    emailFrom: result.data.EMAIL_FROM,
    ...(result.data.EMAIL_HTTP_ENDPOINT !== undefined
      ? { emailHttpEndpoint: result.data.EMAIL_HTTP_ENDPOINT }
      : {}),
    ...(result.data.EMAIL_HTTP_API_KEY !== undefined
      ? { emailHttpApiKey: result.data.EMAIL_HTTP_API_KEY }
      : {}),
    authAccessTokenSecret: result.data.AUTH_ACCESS_TOKEN_SECRET,
    authAccessTokenTtlSeconds: result.data.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    authAccessTokenIssuer: result.data.AUTH_ACCESS_TOKEN_ISSUER,
    authAccessTokenAudience: result.data.AUTH_ACCESS_TOKEN_AUDIENCE,
    authRefreshTokenTtlDays: result.data.AUTH_REFRESH_TOKEN_TTL_DAYS,
    authRefreshCookieSameSite: result.data.AUTH_REFRESH_COOKIE_SAME_SITE,
    authLoginRateLimitIpMax: result.data.AUTH_LOGIN_RATE_LIMIT_IP_MAX,
    authLoginRateLimitIpWindowSeconds: result.data.AUTH_LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS,
    authLoginRateLimitEmailMax: result.data.AUTH_LOGIN_RATE_LIMIT_EMAIL_MAX,
    authLoginRateLimitEmailWindowSeconds: result.data.AUTH_LOGIN_RATE_LIMIT_EMAIL_WINDOW_SECONDS,
    passwordResetTokenTtlMinutes: result.data.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    passwordResetRateLimitIpMax: result.data.PASSWORD_RESET_RATE_LIMIT_IP_MAX,
    passwordResetRateLimitIpWindowSeconds: result.data.PASSWORD_RESET_RATE_LIMIT_IP_WINDOW_SECONDS,
    passwordResetRateLimitEmailMax: result.data.PASSWORD_RESET_RATE_LIMIT_EMAIL_MAX,
    passwordResetRateLimitEmailWindowSeconds:
      result.data.PASSWORD_RESET_RATE_LIMIT_EMAIL_WINDOW_SECONDS,
    trustProxy: result.data.TRUST_PROXY,
  };
}
