import { describe, it, expect, afterAll } from 'vitest';
import { connectDatabase, disconnectDatabase, prisma } from './prisma.js';

describe('Database connection lifecycle', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('connects to PostgreSQL and executes smoke test query', async () => {
    if (!process.env['DATABASE_URL']) {
      // In isolated environments without a database configured, skip live query test.
      return;
    }

    const client = await connectDatabase();
    expect(client).toBeDefined();

    // Verify smoke query execution via $queryRawUnsafe
    const result = await prisma.$queryRawUnsafe<{ one: number }[]>('SELECT 1 as one');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.one).toBe(1);
  });

  it('disconnects cleanly and idempotently', async () => {
    await expect(disconnectDatabase()).resolves.not.toThrow();
    // Repeated call must also be safe
    await expect(disconnectDatabase()).resolves.not.toThrow();
  });
});
