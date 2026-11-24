import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../observability/logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let prismaClientInstance: PrismaClient | null = null;

/**
 * Initializes and returns the shared PrismaClient singleton.
 * Configured with PrismaPg adapter and bounded connection pool behavior.
 *
 * @param databaseUrl Optional explicit database connection URL. If omitted, loaded from loadEnv().
 */
export function getPrismaClient(databaseUrl?: string): PrismaClient {
  if (!prismaClientInstance) {
    const url = databaseUrl ?? loadEnv().databaseUrl;
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected idle PostgreSQL pool client error');
    });

    const adapter = new PrismaPg(pool);
    prismaClientInstance = new PrismaClient({
      adapter,
      log:
        process.env['NODE_ENV'] === 'development'
          ? [
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [{ emit: 'stdout', level: 'error' }],
    });
  }

  return prismaClientInstance;
}

/**
 * Exported reusable Prisma client instance for the API process.
 * Uses a lazy Proxy so importing this module does not trigger database connection
 * or throw if DATABASE_URL is not set during pure unit tests.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * Explicitly connects to the database and verifies connectivity via a smoke test query.
 * Must be called in the server startup path before accepting traffic.
 */
export async function connectDatabase(databaseUrl?: string): Promise<PrismaClient> {
  const client = getPrismaClient(databaseUrl);
  await client.$queryRawUnsafe('SELECT 1');
  return client;
}

/**
 * Executes a bounded smoke query (SELECT 1) to verify database connectivity.
 * Reuses the existing PrismaClient and connection pool singleton.
 *
 * @param timeoutMs Timeout in milliseconds (default: 5000ms).
 */
export async function checkDatabaseReadiness(timeoutMs = 5000): Promise<void> {
  const client = getPrismaClient();

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Database readiness check timed out'));
    }, timeoutMs);
  });

  try {
    await Promise.race([client.$queryRawUnsafe('SELECT 1'), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Gracefully disconnects Prisma client and terminates the PostgreSQL connection pool.
 * Safe to call multiple times (idempotent).
 */
export async function disconnectDatabase(): Promise<void> {
  if (prismaClientInstance) {
    try {
      await prismaClientInstance.$disconnect();
    } catch (err) {
      logger.error({ err }, 'Error during Prisma disconnect');
    } finally {
      prismaClientInstance = null;
    }
  }

  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      logger.error({ err }, 'Error closing PostgreSQL connection pool');
    } finally {
      pool = null;
    }
  }
}
