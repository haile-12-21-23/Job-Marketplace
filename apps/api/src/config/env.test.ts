import { describe, it, expect } from 'vitest';
import { loadEnv, loadDatabaseConfig, EnvironmentValidationError } from './env.js';

describe('loadEnv (Centralized API environment validation)', () => {
  const validDbUrl = 'postgresql://user:password@localhost:5432/jmp_dev?schema=public';
  const validSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('parses valid environment variables into strongly typed ApiConfig', () => {
    const config = loadEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: validDbUrl,
      CORS_ORIGINS: 'https://app.example.com, https://admin.example.com',
      LOG_LEVEL: 'warn',
      APP_WEB_URL: 'https://app.example.com/',
      EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: '120',
      EMAIL_VERIFICATION_RESEND_IP_MAX: '20',
      EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS: '600',
      EMAIL_VERIFICATION_RESEND_EMAIL_MAX: '5',
      EMAIL_VERIFICATION_RESEND_EMAIL_WINDOW_SECONDS: '1800',
      EMAIL_PROVIDER: 'http',
      EMAIL_FROM: 'noreply@example.com',
      EMAIL_HTTP_ENDPOINT: 'https://mail.example.com/send/',
      EMAIL_HTTP_API_KEY: 'super-secret-mail-key',
      AUTH_ACCESS_TOKEN_SECRET: validSecret,
      AUTH_ACCESS_TOKEN_TTL_SECONDS: '600',
      AUTH_ACCESS_TOKEN_ISSUER: 'custom-issuer',
      AUTH_ACCESS_TOKEN_AUDIENCE: 'custom-audience',
      AUTH_REFRESH_TOKEN_TTL_DAYS: '14',
      AUTH_REFRESH_COOKIE_SAME_SITE: 'strict',
      AUTH_LOGIN_RATE_LIMIT_IP_MAX: '15',
      AUTH_LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS: '600',
      AUTH_LOGIN_RATE_LIMIT_EMAIL_MAX: '4',
      AUTH_LOGIN_RATE_LIMIT_EMAIL_WINDOW_SECONDS: '1200',
      TRUST_PROXY: 'true',
    });

    expect(config).toEqual({
      nodeEnv: 'production',
      port: 8080,
      databaseUrl: validDbUrl,
      corsOrigins: ['https://app.example.com', 'https://admin.example.com'],
      logLevel: 'warn',
      appWebUrl: 'https://app.example.com',
      emailVerificationTokenTtlMinutes: 120,
      emailVerificationResendIpMax: 20,
      emailVerificationResendIpWindowSeconds: 600,
      emailVerificationResendEmailMax: 5,
      emailVerificationResendEmailWindowSeconds: 1800,
      emailProvider: 'http',
      emailFrom: 'noreply@example.com',
      emailHttpEndpoint: 'https://mail.example.com/send',
      emailHttpApiKey: 'super-secret-mail-key',
      authAccessTokenSecret: validSecret,
      authAccessTokenTtlSeconds: 600,
      authAccessTokenIssuer: 'custom-issuer',
      authAccessTokenAudience: 'custom-audience',
      authRefreshTokenTtlDays: 14,
      authRefreshCookieSameSite: 'strict',
      authLoginRateLimitIpMax: 15,
      authLoginRateLimitIpWindowSeconds: 600,
      authLoginRateLimitEmailMax: 4,
      authLoginRateLimitEmailWindowSeconds: 1200,
      trustProxy: true,
    });
  });

  it('applies safe defaults for optional variables', () => {
    const config = loadEnv({
      DATABASE_URL: validDbUrl,
      AUTH_ACCESS_TOKEN_SECRET: validSecret,
    });

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.logLevel).toBe('info');
    expect(config.databaseUrl).toBe(validDbUrl);
    expect(config.appWebUrl).toBe('http://localhost:5173');
    expect(config.emailVerificationTokenTtlMinutes).toBe(60);
    expect(config.emailVerificationResendIpMax).toBe(10);
    expect(config.emailVerificationResendIpWindowSeconds).toBe(900);
    expect(config.emailVerificationResendEmailMax).toBe(3);
    expect(config.emailVerificationResendEmailWindowSeconds).toBe(900);
    expect(config.emailProvider).toBe('development');
    expect(config.emailFrom).toBe('no-reply@jobmarketplace.local');
    expect(config.authAccessTokenSecret).toBe(validSecret);
    expect(config.authAccessTokenTtlSeconds).toBe(900);
    expect(config.authAccessTokenIssuer).toBe('job-marketplace-api');
    expect(config.authAccessTokenAudience).toBe('job-marketplace-web');
    expect(config.authRefreshTokenTtlDays).toBe(30);
    expect(config.authRefreshCookieSameSite).toBe('lax');
    expect(config.authLoginRateLimitIpMax).toBe(10);
    expect(config.authLoginRateLimitIpWindowSeconds).toBe(900);
    expect(config.authLoginRateLimitEmailMax).toBe(5);
    expect(config.authLoginRateLimitEmailWindowSeconds).toBe(900);
    expect(config.trustProxy).toBe(false);
  });

  it('validates DATABASE_URL standalone via loadDatabaseConfig', () => {
    expect(loadDatabaseConfig({ DATABASE_URL: validDbUrl })).toEqual({ databaseUrl: validDbUrl });
    expect(() => loadDatabaseConfig({})).toThrowError(EnvironmentValidationError);
  });

  it('fails fast when required DATABASE_URL or AUTH_ACCESS_TOKEN_SECRET is missing or weak', () => {
    expect(() => loadEnv({})).toThrowError(EnvironmentValidationError);
    try {
      loadEnv({});
      expect.unreachable('Should have thrown');
    } catch (err) {
      const error = err as EnvironmentValidationError;
      const fields = error.issues.map((i) => i.field);
      expect(fields).toContain('DATABASE_URL');
      expect(fields).toContain('AUTH_ACCESS_TOKEN_SECRET');
    }

    const shortSecret = 'too-short-secret-12345';
    try {
      loadEnv({ DATABASE_URL: validDbUrl, AUTH_ACCESS_TOKEN_SECRET: shortSecret });
      expect.unreachable('Should have thrown');
    } catch (err) {
      const error = err as EnvironmentValidationError;
      expect(error.message).toContain('AUTH_ACCESS_TOKEN_SECRET must be at least 32 characters');
      expect(error.message).not.toContain(shortSecret);
    }
  });

  it('fails fast when DATABASE_URL is whitespace', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: '   ', AUTH_ACCESS_TOKEN_SECRET: validSecret }),
    ).toThrowError(EnvironmentValidationError);
  });

  it('fails fast when DATABASE_URL is malformed', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'not-a-valid-url', AUTH_ACCESS_TOKEN_SECRET: validSecret }),
    ).toThrowError(EnvironmentValidationError);
  });

  it('fails fast when DATABASE_URL protocol is not postgresql or postgres', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
      }),
    ).toThrowError('DATABASE_URL has invalid protocol "mysql:"');
  });

  it('fails fast when DATABASE_URL is missing host', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql:///database',
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
      }),
    ).toThrowError('DATABASE_URL is missing a host name');
  });

  it('fails fast when DATABASE_URL is missing database name', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/',
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
      }),
    ).toThrowError('DATABASE_URL is missing a database name in the path');
  });

  it('never leaks passwords or raw credentials in thrown error message or issues', () => {
    const secretPassword = 'SUPER_SECRET_COMPLEX_PASSWORD_123$!';
    const rawUrl = `postgresql://db_admin:${secretPassword}@db.internal.example.com:5432/`;

    try {
      loadEnv({ DATABASE_URL: rawUrl, AUTH_ACCESS_TOKEN_SECRET: validSecret });
      expect.unreachable('Should have thrown');
    } catch (err) {
      const error = err as EnvironmentValidationError;
      expect(error.message).not.toContain(secretPassword);
      for (const issue of error.issues) {
        expect(issue.message).not.toContain(secretPassword);
        expect(issue.message).not.toContain('db_admin');
      }
    }
  });

  it('fails fast when PORT or auth TTL bounds are violated', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: validDbUrl, AUTH_ACCESS_TOKEN_SECRET: validSecret, PORT: '0' }),
    ).toThrowError(EnvironmentValidationError);
    expect(() =>
      loadEnv({ DATABASE_URL: validDbUrl, AUTH_ACCESS_TOKEN_SECRET: validSecret, PORT: '65536' }),
    ).toThrowError(EnvironmentValidationError);
    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        AUTH_ACCESS_TOKEN_TTL_SECONDS: '30',
      }),
    ).toThrowError('AUTH_ACCESS_TOKEN_TTL_SECONDS must be between 60 and 3600');
    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        AUTH_REFRESH_TOKEN_TTL_DAYS: '91',
      }),
    ).toThrowError('AUTH_REFRESH_TOKEN_TTL_DAYS must be between 1 and 90');
  });

  it('fails fast when NODE_ENV or LOG_LEVEL is invalid', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        NODE_ENV: 'staging',
      }),
    ).toThrowError('NODE_ENV must be one of: development, test, production');

    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        LOG_LEVEL: 'verbose',
      }),
    ).toThrowError('LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace, silent');
  });

  it('fails fast when CORS_ORIGINS uses non-http/https scheme or is malformed', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        CORS_ORIGINS: 'ftp://files.example.com',
      }),
    ).toThrowError('CORS_ORIGINS must use http: or https: scheme');

    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        CORS_ORIGINS: 'not-a-valid-url',
      }),
    ).toThrowError('CORS_ORIGINS contains an invalid origin URL format');
  });

  it('requires EMAIL_HTTP_ENDPOINT and EMAIL_HTTP_API_KEY when EMAIL_PROVIDER is http', () => {
    try {
      loadEnv({
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        EMAIL_PROVIDER: 'http',
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      const error = err as EnvironmentValidationError;
      const fields = error.issues.map((i) => i.field);
      expect(fields).toContain('EMAIL_HTTP_ENDPOINT');
      expect(fields).toContain('EMAIL_HTTP_API_KEY');
    }
  });

  it('fails fast in production when EMAIL_PROVIDER is omitted or set to development', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        APP_WEB_URL: 'https://app.example.com',
      }),
    ).toThrowError(
      'EMAIL_PROVIDER must be "http" in production (the development email adapter is not allowed in production)',
    );

    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        APP_WEB_URL: 'https://app.example.com',
        EMAIL_PROVIDER: 'development',
      }),
    ).toThrowError(
      'EMAIL_PROVIDER must be "http" in production (the development email adapter is not allowed in production)',
    );
  });

  it('requires https: URLs and prevents SameSite=None over insecure HTTP', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        APP_WEB_URL: 'http://app.example.com',
        EMAIL_PROVIDER: 'http',
        EMAIL_HTTP_ENDPOINT: 'https://mail.example.com/send',
        EMAIL_HTTP_API_KEY: 'secret-key',
      }),
    ).toThrowError('APP_WEB_URL must use https: scheme in production');

    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        APP_WEB_URL: 'https://app.example.com',
        EMAIL_PROVIDER: 'http',
        EMAIL_HTTP_ENDPOINT: 'http://mail.example.com/send',
        EMAIL_HTTP_API_KEY: 'secret-key',
      }),
    ).toThrowError('EMAIL_HTTP_ENDPOINT must use https: scheme in production');

    expect(() =>
      loadEnv({
        NODE_ENV: 'development',
        DATABASE_URL: validDbUrl,
        AUTH_ACCESS_TOKEN_SECRET: validSecret,
        AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
      }),
    ).toThrowError(
      'AUTH_REFRESH_COOKIE_SAME_SITE="none" requires NODE_ENV="production" with Secure=true and an https: APP_WEB_URL',
    );
  });
});
