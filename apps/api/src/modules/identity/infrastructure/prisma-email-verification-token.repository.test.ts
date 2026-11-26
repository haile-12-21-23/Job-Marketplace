import { describe, it, expect, afterAll } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { disconnectDatabase, getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import { PrismaEmailVerificationTokenRepository } from './prisma-email-verification-token.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

describe('PrismaEmailVerificationTokenRepository', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('persists hashed tokens, supersedes prior tokens, enforces single-use concurrency, and sets emailVerifiedAt once in PostgreSQL', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const tokenRepo = new PrismaEmailVerificationTokenRepository(prisma);
    const tokenService = new CryptoVerificationTokenService();
    const testEmail = `test.verify.${Date.now()}@example.com`;

    try {
      const user = await userRepo.create({
        displayName: 'Verify Integration User',
        email: testEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        status: UserStatus.ACTIVE,
      });

      const t0 = new Date();
      const firstRaw = tokenService.generateToken();
      const firstHash = tokenService.hashToken(firstRaw);
      await tokenRepo.issueToken({
        userId: user.id,
        tokenHash: firstHash,
        expiresAt: new Date(t0.getTime() + 60 * 60_000),
        now: t0,
      });

      // Second token supersedes first token
      const t1 = new Date(t0.getTime() + 1000);
      const secondRaw = tokenService.generateToken();
      const secondHash = tokenService.hashToken(secondRaw);
      await tokenRepo.issueToken({
        userId: user.id,
        tokenHash: secondHash,
        expiresAt: new Date(t1.getTime() + 60 * 60_000),
        now: t1,
      });

      // Superseded token must fail
      const firstOutcome = await tokenRepo.consumeAndVerifyUser(
        firstHash,
        new Date(t1.getTime() + 1000),
      );
      expect(firstOutcome).toBe('invalid_or_expired');

      // Concurrent verification attempts with the active token: exactly one must succeed
      const verifyAt = new Date(t1.getTime() + 2000);
      const outcomes = await Promise.all([
        tokenRepo.consumeAndVerifyUser(secondHash, verifyAt),
        tokenRepo.consumeAndVerifyUser(secondHash, verifyAt),
      ]);

      expect(outcomes.filter((o) => o === 'verified')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'invalid_or_expired')).toHaveLength(1);

      const updatedUser = await userRepo.findByEmail(testEmail);
      expect(updatedUser?.emailVerifiedAt).not.toBeNull();

      // Reused token must fail
      const reuseOutcome = await tokenRepo.consumeAndVerifyUser(
        secondHash,
        new Date(verifyAt.getTime() + 1000),
      );
      expect(reuseOutcome).toBe('invalid_or_expired');
    } finally {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });

  it('serializes concurrent token issuance per user in PostgreSQL so only one active token survives', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const tokenRepo = new PrismaEmailVerificationTokenRepository(prisma);
    const tokenService = new CryptoVerificationTokenService();
    const testEmail = `test.concurrent.issue.${Date.now()}@example.com`;

    try {
      const user = await userRepo.create({
        displayName: 'Concurrent Issue User',
        email: testEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        status: UserStatus.ACTIVE,
      });

      const t0 = new Date();
      const rawA = tokenService.generateToken();
      const rawB = tokenService.generateToken();
      const hashA = tokenService.hashToken(rawA);
      const hashB = tokenService.hashToken(rawB);

      // Start two simultaneous issueToken operations from zero existing token rows
      await Promise.all([
        tokenRepo.issueToken({
          userId: user.id,
          tokenHash: hashA,
          expiresAt: new Date(t0.getTime() + 60 * 60_000),
          now: t0,
        }),
        tokenRepo.issueToken({
          userId: user.id,
          tokenHash: hashB,
          expiresAt: new Date(t0.getTime() + 60 * 60_000),
          now: new Date(t0.getTime() + 1),
        }),
      ]);

      const storedTokens = await prisma.emailVerificationToken.findMany({
        where: { userId: user.id },
      });
      const activeTokens = storedTokens.filter((t) => t.usedAt === null);
      const supersededTokens = storedTokens.filter((t) => t.usedAt !== null);

      expect(storedTokens).toHaveLength(2);
      expect(activeTokens).toHaveLength(1);
      expect(supersededTokens).toHaveLength(1);

      const verifyAt = new Date(t0.getTime() + 1000);
      const survivingHash = activeTokens[0]!.tokenHash;
      const supersededHash = supersededTokens[0]!.tokenHash;

      expect(await tokenRepo.consumeAndVerifyUser(supersededHash, verifyAt)).toBe(
        'invalid_or_expired',
      );
      expect(await tokenRepo.consumeAndVerifyUser(survivingHash, verifyAt)).toBe('verified');
    } finally {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });
});
