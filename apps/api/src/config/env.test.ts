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
    });

    expect(config).toEqual({
      nodeEnv: 'production',
      port: 8080,
      databaseUrl: validDbUrl,
      corsOrigins: ['https://app.example.com', 'https://admin.example.com'],
      logLevel: 'warn',
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
});
