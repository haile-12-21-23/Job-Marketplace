import { describe, it, expect, afterAll } from 'vitest';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import { disconnectDatabase, getPrismaClient } from '../../../infrastructure/database/prisma.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

describe('PrismaUserRepository', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('translates Prisma P2002 unique constraint error into AppError 409', async () => {
    const fakeClient = {
      user: {
        create: () => {
          const err = Object.assign(
            new Error('Unique constraint failed on the fields: (`email`)'),
            { code: 'P2002' },
          );
          throw err;
        },
        findUnique: () => Promise.resolve(null),
      },
    } as unknown as PrismaClient;

    const repo = new PrismaUserRepository(fakeClient);

    await expect(
      repo.create({
        displayName: 'Duplicate User',
        email: 'dup@example.com',
        passwordHash: 'some_hash',
      }),
    ).rejects.toThrowError(AppError);

    try {
      await repo.create({
        displayName: 'Duplicate User',
        email: 'dup@example.com',
        passwordHash: 'some_hash',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(409);
      expect(appErr.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(appErr.errors).toEqual([
        {
          pointer: '#/email',
          code: 'DUPLICATE_EMAIL',
          detail: 'An account with this email address already exists.',
        },
      ]);
    }
  });

  it('creates and finds user in PostgreSQL if DATABASE_URL is configured', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const repo = new PrismaUserRepository(prisma);
    const testEmail = `test.reg.${Date.now()}@example.com`;

    try {
      const user = await repo.create({
        displayName: 'Integration User',
        email: testEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        status: UserStatus.ACTIVE,
      });

      expect(user.id).toBeDefined();
      expect(user.displayName).toBe('Integration User');
      expect(user.email).toBe(testEmail);
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.emailVerifiedAt).toBeNull();

      const found = await repo.findByEmail(testEmail);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(user.id);
      expect(found?.email).toBe(testEmail);
    } finally {
      // Clean up test record
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });
});
