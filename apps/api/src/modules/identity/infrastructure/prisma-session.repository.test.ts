import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { disconnectDatabase, getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { CryptoRefreshTokenService } from '../domain/refresh-token.js';
import { PrismaSessionRepository } from './prisma-session.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

describe('PrismaSessionRepository', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('creates persisted UserSession with hashed refresh token and separates safe findByEmail from findCredentialsByEmail', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const sessionRepo = new PrismaSessionRepository(prisma);
    const refreshTokenService = new CryptoRefreshTokenService();
    const testEmail = `test.session.${Date.now()}@example.com`;

    try {
      const user = await userRepo.create({
        displayName: 'Session Integration User',
        email: testEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        status: UserStatus.ACTIVE,
      });

      const safeLookup = await userRepo.findByEmail(testEmail);
      expect(safeLookup?.passwordHash).toBeUndefined();

      const credLookup = await userRepo.findCredentialsByEmail(testEmail);
      expect(credLookup?.passwordHash).toBe('$2a$10$abcdefghijklmnopqrstuvwxyz1234567890');

      const rawRefresh = refreshTokenService.generateToken();
      const refreshHash = refreshTokenService.hashToken(rawRefresh);
      const tokenFamilyId = randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 86_400_000);

      const session = await sessionRepo.create({
        userId: user.id,
        tokenFamilyId,
        refreshTokenHash: refreshHash,
        parentSessionId: null,
        expiresAt,
      });

      expect(session.id).toBeDefined();
      expect(session.userId).toBe(user.id);
      expect(session.tokenFamilyId).toBe(tokenFamilyId);
      expect(session.refreshTokenHash).toBe(refreshHash);
      expect(session.refreshTokenHash).not.toBe(rawRefresh);
      expect(session.parentSessionId).toBeNull();
      expect(session.revokedAt).toBeNull();

      const persisted = await prisma.userSession.findUnique({ where: { id: session.id } });
      expect(persisted).not.toBeNull();
      expect(persisted?.refreshTokenHash).toBe(refreshHash);
    } finally {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });
});
