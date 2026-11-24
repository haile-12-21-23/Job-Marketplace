/**
 * Minimal database-specific configuration guard for JMP-27.
 *
 * Full shared environment validation belongs to JMP-29.
 * This guard validates DATABASE_URL format and fast-fails without
 * exposing credentials in error messages or logs.
 */

export interface DatabaseConfig {
  databaseUrl: string;
}

/**
 * Validates process.env.DATABASE_URL and returns the database configuration.
 *
 * @throws {Error} Concise, safe error message without leaking credentials or raw URL.
 */
export function getDatabaseConfig(): DatabaseConfig {
  const rawUrl = process.env['DATABASE_URL'];

  if (!rawUrl || rawUrl.trim() === '') {
    throw new Error(
      'DATABASE_URL environment variable is missing. Set a valid PostgreSQL connection URL in .env',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      'DATABASE_URL environment variable is malformed. Expected a valid postgresql:// or postgres:// URL',
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error(
      `DATABASE_URL has invalid protocol "${protocol}". Expected postgresql: or postgres:`,
    );
  }

  if (!parsed.hostname || parsed.hostname.trim() === '') {
    throw new Error(
      'DATABASE_URL is missing a host name. Expected format: postgresql://[user[:password]@]host[:port]/database',
    );
  }

  const databaseName = parsed.pathname.replace(/^\//, '').trim();
  if (!databaseName) {
    throw new Error(
      'DATABASE_URL is missing a database name in the path. Expected format: postgresql://[user[:password]@]host[:port]/database',
    );
  }

  return {
    databaseUrl: rawUrl,
  };
}
