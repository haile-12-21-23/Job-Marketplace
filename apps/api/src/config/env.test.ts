import { describe, it, expect } from 'vitest';
import { loadEnv, EnvironmentValidationError } from './env.js';

describe('loadEnv (Centralized API environment validation)', () => {
  const validDbUrl = 'postgresql://user:password@localhost:5432/jmp_dev?schema=public';

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
    });
  });

  it('applies safe defaults for optional variables', () => {
    const config = loadEnv({
      DATABASE_URL: validDbUrl,
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
  });

  it('fails fast when required DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrowError(EnvironmentValidationError);
    try {
      loadEnv({});
      expect.unreachable('Should have thrown');
    } catch (err) {
      const error = err as EnvironmentValidationError;
      expect(error.issues.some((i) => i.field === 'DATABASE_URL')).toBe(true);
    }
  });

  it('fails fast when DATABASE_URL is whitespace', () => {
    expect(() => loadEnv({ DATABASE_URL: '   ' })).toThrowError(EnvironmentValidationError);
  });

  it('fails fast when DATABASE_URL is malformed', () => {
    expect(() => loadEnv({ DATABASE_URL: 'not-a-valid-url' })).toThrowError(
      EnvironmentValidationError,
    );
  });

  it('fails fast when DATABASE_URL protocol is not postgresql or postgres', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://user:pass@localhost:3306/db' })).toThrowError(
      'DATABASE_URL has invalid protocol "mysql:"',
    );
  });

  it('fails fast when DATABASE_URL is missing host', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql:///database' })).toThrowError(
      'DATABASE_URL is missing a host name',
    );
  });

  it('fails fast when DATABASE_URL is missing database name', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/' })).toThrowError(
      'DATABASE_URL is missing a database name in the path',
    );
  });

  it('never leaks passwords or raw credentials in thrown error message or issues', () => {
    const secretPassword = 'SUPER_SECRET_COMPLEX_PASSWORD_123$!';
    const rawUrl = `postgresql://db_admin:${secretPassword}@db.internal.example.com:5432/`;

    try {
      loadEnv({ DATABASE_URL: rawUrl });
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

  it('fails fast when PORT is outside valid TCP port range (1-65535)', () => {
    expect(() => loadEnv({ DATABASE_URL: validDbUrl, PORT: '0' })).toThrowError(
      EnvironmentValidationError,
    );
    expect(() => loadEnv({ DATABASE_URL: validDbUrl, PORT: '-1' })).toThrowError(
      EnvironmentValidationError,
    );
    expect(() => loadEnv({ DATABASE_URL: validDbUrl, PORT: '65536' })).toThrowError(
      EnvironmentValidationError,
    );
    expect(() => loadEnv({ DATABASE_URL: validDbUrl, PORT: '3000.5' })).toThrowError(
      EnvironmentValidationError,
    );
    expect(() => loadEnv({ DATABASE_URL: validDbUrl, PORT: 'not-a-number' })).toThrowError(
      EnvironmentValidationError,
    );
  });

  it('fails fast when NODE_ENV is invalid', () => {
    expect(() => loadEnv({ DATABASE_URL: validDbUrl, NODE_ENV: 'staging' })).toThrowError(
      'NODE_ENV must be one of: development, test, production',
    );
  });

  it('fails fast when LOG_LEVEL is invalid', () => {
    expect(() => loadEnv({ DATABASE_URL: validDbUrl, LOG_LEVEL: 'verbose' })).toThrowError(
      'LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace, silent',
    );
  });

  it('fails fast when CORS_ORIGINS uses non-http/https scheme or is malformed', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: validDbUrl, CORS_ORIGINS: 'ftp://files.example.com' }),
    ).toThrowError('CORS_ORIGINS must use http: or https: scheme');

    expect(() =>
      loadEnv({ DATABASE_URL: validDbUrl, CORS_ORIGINS: 'not-a-valid-url' }),
    ).toThrowError('CORS_ORIGINS contains an invalid origin URL format');
  });

  it('returns valid config for postgres: URL', () => {
    const postgresUrl = 'postgres://user:secret@localhost:5432/jmp_dev';
    const config = loadEnv({ DATABASE_URL: postgresUrl });
    expect(config.databaseUrl).toBe(postgresUrl);
  });

  it('returns valid config for postgresql: URL', () => {
    const config = loadEnv({ DATABASE_URL: validDbUrl });
    expect(config.databaseUrl).toBe(validDbUrl);
  });

  it('collects multiple issues without exiting early', () => {
    try {
      loadEnv({
        PORT: 'invalid-port',
        NODE_ENV: 'invalid-env',
        // missing DATABASE_URL
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      const error = err as EnvironmentValidationError;
      expect(error.issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('requires EMAIL_HTTP_ENDPOINT and EMAIL_HTTP_API_KEY when EMAIL_PROVIDER is http', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        EMAIL_PROVIDER: 'http',
      }),
    ).toThrowError(EnvironmentValidationError);

    try {
      loadEnv({
        DATABASE_URL: validDbUrl,
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

  it('fails fast when APP_WEB_URL or EMAIL_VERIFICATION_TOKEN_TTL_MINUTES is invalid', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        APP_WEB_URL: 'ftp://invalid.example.com',
      }),
    ).toThrowError('APP_WEB_URL must use http: or https: scheme');

    expect(() =>
      loadEnv({
        DATABASE_URL: validDbUrl,
        EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: '2',
      }),
    ).toThrowError('EMAIL_VERIFICATION_TOKEN_TTL_MINUTES must be between 5 and 10080');
  });

  it('fails fast in production when EMAIL_PROVIDER is omitted or set to development', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDbUrl,
        APP_WEB_URL: 'https://app.example.com',
      }),
    ).toThrowError(
      'EMAIL_PROVIDER must be "http" in production (the development email adapter is not allowed in production)',
    );

    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDbUrl,
        APP_WEB_URL: 'https://app.example.com',
        EMAIL_PROVIDER: 'development',
      }),
    ).toThrowError(
      'EMAIL_PROVIDER must be "http" in production (the development email adapter is not allowed in production)',
    );
  });

  it('requires https: URLs for APP_WEB_URL and EMAIL_HTTP_ENDPOINT in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDbUrl,
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
        APP_WEB_URL: 'https://app.example.com',
        EMAIL_PROVIDER: 'http',
        EMAIL_HTTP_ENDPOINT: 'http://mail.example.com/send',
        EMAIL_HTTP_API_KEY: 'secret-key',
      }),
    ).toThrowError('EMAIL_HTTP_ENDPOINT must use https: scheme in production');
  });

  it('allows http: URLs and development provider in non-production environments', () => {
    const devConfig = loadEnv({
      NODE_ENV: 'development',
      DATABASE_URL: validDbUrl,
      APP_WEB_URL: 'http://localhost:5173',
      EMAIL_PROVIDER: 'http',
      EMAIL_HTTP_ENDPOINT: 'http://localhost:8025/send',
      EMAIL_HTTP_API_KEY: 'local-key',
    });

    expect(devConfig.appWebUrl).toBe('http://localhost:5173');
    expect(devConfig.emailHttpEndpoint).toBe('http://localhost:8025/send');
  });
});
