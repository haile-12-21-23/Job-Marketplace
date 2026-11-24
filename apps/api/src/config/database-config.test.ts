import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseConfig } from './database-config.js';

describe('getDatabaseConfig', () => {
  const originalEnv = process.env['DATABASE_URL'];

  beforeEach(() => {
    delete process.env['DATABASE_URL'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['DATABASE_URL'] = originalEnv;
    } else {
      delete process.env['DATABASE_URL'];
    }
  });

  it('throws a safe error when DATABASE_URL is missing', () => {
    expect(() => getDatabaseConfig()).toThrowError(
      'DATABASE_URL environment variable is missing',
    );
  });

  it('throws a safe error when DATABASE_URL is empty whitespace', () => {
    process.env['DATABASE_URL'] = '   ';
    expect(() => getDatabaseConfig()).toThrowError(
      'DATABASE_URL environment variable is missing',
    );
  });

  it('throws a safe error when DATABASE_URL is malformed', () => {
    process.env['DATABASE_URL'] = 'not-a-valid-url';
    expect(() => getDatabaseConfig()).toThrowError(
      'DATABASE_URL environment variable is malformed',
    );
  });

  it('throws a safe error when protocol is not postgresql or postgres', () => {
    process.env['DATABASE_URL'] = 'mysql://user:pass@localhost:3306/db';
    expect(() => getDatabaseConfig()).toThrowError(
      'DATABASE_URL has invalid protocol "mysql:"',
    );
  });

  it('throws a safe error when host is missing', () => {
    process.env['DATABASE_URL'] = 'postgresql:///database';
    expect(() => getDatabaseConfig()).toThrowError(
      'DATABASE_URL is missing a host name',
    );
  });

  it('throws a safe error when database name is missing', () => {
    process.env['DATABASE_URL'] = 'postgresql://user:pass@localhost:5432/';
    expect(() => getDatabaseConfig()).toThrowError(
      'DATABASE_URL is missing a database name in the path',
    );
  });

  it('does not leak passwords in error messages', () => {
    const secretPassword = 'SUPER_SECRET_PASSWORD_123';
    process.env['DATABASE_URL'] = `http://user:${secretPassword}@localhost/db`;
    try {
      getDatabaseConfig();
      expect.unreachable('Should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain(secretPassword);
    }
  });

  it('returns valid config for postgresql: URL', () => {
    const validUrl = 'postgresql://user:secret@localhost:5432/jmp_dev?schema=public';
    process.env['DATABASE_URL'] = validUrl;
    const config = getDatabaseConfig();
    expect(config.databaseUrl).toBe(validUrl);
  });

  it('returns valid config for postgres: URL', () => {
    const validUrl = 'postgres://user:secret@localhost:5432/jmp_dev';
    process.env['DATABASE_URL'] = validUrl;
    const config = getDatabaseConfig();
    expect(config.databaseUrl).toBe(validUrl);
  });
});
