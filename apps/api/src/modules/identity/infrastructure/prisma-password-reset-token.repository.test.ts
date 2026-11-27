import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { OutboxStatus, UserStatus } from '../../../generated/prisma/enums.js';
import { disconnectDatabase, getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { OutboxPayloadCipher } from '../domain/outbox-payload-cipher.js';
import { CryptoRefreshTokenService } from '../domain/refresh-token.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import { PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE } from '../ports/password-reset-outbox.repository.js';
import { PrismaPasswordResetOutboxRepository } from './prisma-password-reset-outbox.repository.js';
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository.js';
import { PrismaSessionRepository } from './prisma-session.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

describe('PrismaPasswordResetTokenRepository', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('persists hashed tokens, supersedes prior tokens, enforces single-use concurrency, and revokes all user sessions across families', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const resetRepo = new PrismaPasswordResetTokenRepository(prisma);
    const sessionRepo = new PrismaSessionRepository(prisma);
    const tokenService = new CryptoVerificationTokenService();
    const refreshTokenService = new CryptoRefreshTokenService();

    const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const targetEmail = `test.pwreset.${suffix}@example.com`;
    const otherEmail = `test.pwreset.other.${suffix}@example.com`;

    try {
      const targetUser = await userRepo.create({
        displayName: 'Target Reset User',
        email: targetEmail,
        passwordHash: '$2a$10$oldpasswordhash123456789012345678901234567890',
        status: UserStatus.ACTIVE,
      });
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { emailVerifiedAt: new Date('2026-11-26T08:00:00Z') },
      });

      const otherUser = await userRepo.create({
        displayName: 'Other User',
        email: otherEmail,
        passwordHash: '$2a$10$otheruserhash1234567890123456789012345678901',
        status: UserStatus.ACTIVE,
      });
      await prisma.user.update({
        where: { id: otherUser.id },
        data: { emailVerifiedAt: new Date('2026-11-26T08:00:00Z') },
      });

      // Create sessions across two different families for targetUser + one for otherUser
      const sessionExpiry = new Date(Date.now() + 30 * 86_400_000);
      await sessionRepo.create({
        userId: targetUser.id,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
        parentSessionId: null,
        expiresAt: sessionExpiry,
      });
      await sessionRepo.create({
        userId: targetUser.id,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
        parentSessionId: null,
        expiresAt: sessionExpiry,
      });
      const otherSession = await sessionRepo.create({
        userId: otherUser.id,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
        parentSessionId: null,
        expiresAt: sessionExpiry,
      });

      const t0 = new Date('2026-11-27T10:00:00Z');
      const firstRaw = tokenService.generateToken();
      const firstHash = tokenService.hashToken(firstRaw);
      await resetRepo.issueToken({
        userId: targetUser.id,
        tokenHash: firstHash,
        expiresAt: new Date(t0.getTime() + 30 * 60_000),
        now: t0,
      });

      // Second token supersedes the first
      const t1 = new Date(t0.getTime() + 1000);
      const secondRaw = tokenService.generateToken();
      const secondHash = tokenService.hashToken(secondRaw);
      await resetRepo.issueToken({
        userId: targetUser.id,
        tokenHash: secondHash,
        expiresAt: new Date(t1.getTime() + 30 * 60_000),
        now: t1,
      });

      // Verify raw tokens are not persisted
      const storedRows = await prisma.passwordResetToken.findMany({
        where: { userId: targetUser.id },
      });
      expect(storedRows.some((r) => r.tokenHash === firstRaw || r.tokenHash === secondRaw)).toBe(
        false,
      );

      // Superseded token fails
      expect(
        await resetRepo.consumeAndResetPassword({
          tokenHash: firstHash,
          newPasswordHash: '$2a$10$newhash',
          now: new Date(t1.getTime() + 1000),
        }),
      ).toBe('invalid_or_expired');

      // Concurrent consume of active token: exactly one succeeds
      const resetAt = new Date(t1.getTime() + 2000);
      const outcomes = await Promise.all([
        resetRepo.consumeAndResetPassword({
          tokenHash: secondHash,
          newPasswordHash: '$2a$10$newpasswordhash_winner_12345678901234567890',
          now: resetAt,
        }),
        resetRepo.consumeAndResetPassword({
          tokenHash: secondHash,
          newPasswordHash: '$2a$10$newpasswordhash_loser_123456789012345678901',
          now: resetAt,
        }),
      ]);

      expect(outcomes.filter((o) => o === 'reset')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'invalid_or_expired')).toHaveLength(1);

      // All sessions of targetUser across every family are revoked; otherUser session untouched
      const activeTargetSessions = await prisma.userSession.findMany({
        where: { userId: targetUser.id, revokedAt: null },
      });
      expect(activeTargetSessions).toHaveLength(0);

      const persistedOtherSession = await prisma.userSession.findUnique({
        where: { id: otherSession.id },
      });
      expect(persistedOtherSession?.revokedAt).toBeNull();

      // Reusing consumed token fails
      expect(
        await resetRepo.consumeAndResetPassword({
          tokenHash: secondHash,
          newPasswordHash: '$2a$10$anotherhash',
          now: new Date(resetAt.getTime() + 1000),
        }),
      ).toBe('invalid_or_expired');
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [targetEmail, otherEmail] } },
      });
    }
  });

  it('serializes concurrent issuance per user and rolls back atomically on failure', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const resetRepo = new PrismaPasswordResetTokenRepository(prisma);
    const sessionRepo = new PrismaSessionRepository(prisma);
    const tokenService = new CryptoVerificationTokenService();
    const refreshTokenService = new CryptoRefreshTokenService();
    const testEmail = `test.pwreset.rollback.${Date.now()}@example.com`;

    try {
      const user = await userRepo.create({
        displayName: 'Rollback User',
        email: testEmail,
        passwordHash: '$2a$10$initialpasswordhash123456789012345678901234',
        status: UserStatus.ACTIVE,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date('2026-11-26T08:00:00Z') },
      });

      const session = await sessionRepo.create({
        userId: user.id,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
        parentSessionId: null,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      });

      // Concurrent issuance from zero rows yields exactly one active token
      const t0 = new Date('2026-11-27T10:00:00Z');
      const hashA = tokenService.hashToken(tokenService.generateToken());
      const hashB = tokenService.hashToken(tokenService.generateToken());
      await Promise.all([
        resetRepo.issueToken({
          userId: user.id,
          tokenHash: hashA,
          expiresAt: new Date(t0.getTime() + 30 * 60_000),
          now: t0,
        }),
        resetRepo.issueToken({
          userId: user.id,
          tokenHash: hashB,
          expiresAt: new Date(t0.getTime() + 30 * 60_000),
          now: new Date(t0.getTime() + 1),
        }),
      ]);

      const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
      const activeTokens = tokens.filter((t) => t.usedAt === null);
      expect(tokens).toHaveLength(2);
      expect(activeTokens).toHaveLength(1);
      const activeHash = activeTokens[0]!.tokenHash;

      // Force failure during session revocation step inside real PostgreSQL transaction
      const failingClient = new Proxy(prisma, {
        get(target, prop) {
          if (prop === '$transaction') {
            return async (fn: (tx: unknown) => Promise<unknown>) =>
              target.$transaction(async (realTx) => {
                const proxiedTx = new Proxy(realTx, {
                  get(txTarget, txProp) {
                    if (txProp === 'userSession') {
                      return new Proxy(txTarget.userSession, {
                        get(usTarget, usProp) {
                          if (usProp === 'updateMany') {
                            return async () => {
                              throw new Error('Forced session revocation failure');
                            };
                          }
                          return Reflect.get(usTarget, usProp);
                        },
                      });
                    }
                    return Reflect.get(txTarget, txProp);
                  },
                });
                return fn(proxiedTx);
              });
          }
          return Reflect.get(target, prop);
        },
      }) as unknown as PrismaClient;

      const failingRepo = new PrismaPasswordResetTokenRepository(failingClient);
      await expect(
        failingRepo.consumeAndResetPassword({
          tokenHash: activeHash,
          newPasswordHash: '$2a$10$shouldrollback123456789012345678901234567',
          now: new Date(t0.getTime() + 5000),
        }),
      ).rejects.toThrow('Forced session revocation failure');

      // Token remains unused, password hash unchanged, and session still active
      const persistedToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: activeHash },
      });
      const persistedUser = await prisma.user.findUnique({ where: { id: user.id } });
      const persistedSession = await prisma.userSession.findUnique({ where: { id: session.id } });
      expect(persistedToken?.usedAt).toBeNull();
      expect(persistedUser?.passwordHash).toBe(
        '$2a$10$initialpasswordhash123456789012345678901234',
      );
      expect(persistedSession?.revokedAt).toBeNull();

      // Expired token cannot be consumed
      expect(
        await resetRepo.consumeAndResetPassword({
          tokenHash: activeHash,
          newPasswordHash: '$2a$10$expiredattempt12345678901234567890123456',
          now: new Date(t0.getTime() + 31 * 60_000),
        }),
      ).toBe('invalid_or_expired');
    } finally {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });

  it('serializes password reset against concurrent refresh rotation and pre-reset login session creation in PostgreSQL', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const resetRepo = new PrismaPasswordResetTokenRepository(prisma);
    const sessionRepo = new PrismaSessionRepository(prisma);
    const tokenService = new CryptoVerificationTokenService();
    const refreshTokenService = new CryptoRefreshTokenService();
    const testEmail = `test.pwreset.race.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;

    try {
      const oldPasswordHash = '$2a$10$oldpasswordhash_race_123456789012345678901';
      const user = await userRepo.create({
        displayName: 'Reset Race User',
        email: testEmail,
        passwordHash: oldPasswordHash,
        status: UserStatus.ACTIVE,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date('2026-11-26T08:00:00Z') },
      });

      const baseTime = new Date('2026-11-27T10:00:00Z');
      const sessionExpiry = new Date(baseTime.getTime() + 30 * 86_400_000);

      // 1. Race password reset against refresh rotation across multiple iterations
      for (let i = 0; i < 5; i++) {
        const iterationHash = `$2a$10$oldpasswordhash_iter${i}_12345678901234567890`;
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: iterationHash },
        });

        const refreshHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        await sessionRepo.create({
          userId: user.id,
          tokenFamilyId: randomUUID(),
          refreshTokenHash: refreshHash,
          parentSessionId: null,
          expiresAt: sessionExpiry,
        });

        const resetTokenHash = tokenService.hashToken(tokenService.generateToken());
        await resetRepo.issueToken({
          userId: user.id,
          tokenHash: resetTokenHash,
          expiresAt: new Date(baseTime.getTime() + 30 * 60_000),
          now: baseTime,
        });

        const childRefreshHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        const raceTime = new Date(baseTime.getTime() + 5000);

        const [resetOutcome, refreshResult] = await Promise.all([
          resetRepo.consumeAndResetPassword({
            tokenHash: resetTokenHash,
            newPasswordHash: `$2a$10$newpasswordhash_iter${i}_12345678901234567890`,
            now: raceTime,
          }),
          sessionRepo.rotateSession({
            presentedTokenHash: refreshHash,
            newSessionId: randomUUID(),
            newRefreshTokenHash: childRefreshHash,
            now: raceTime,
          }),
        ]);

        expect(resetOutcome).toBe('reset');
        expect(['rotated', 'revoked']).toContain(refreshResult.outcome);

        // Zero live sessions may remain after reset completes
        const activeSessions = await prisma.userSession.findMany({
          where: { userId: user.id, revokedAt: null },
        });
        expect(activeSessions).toHaveLength(0);

        const childFollowup = await sessionRepo.rotateSession({
          presentedTokenHash: childRefreshHash,
          newSessionId: randomUUID(),
          newRefreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
          now: new Date(raceTime.getTime() + 1000),
        });
        expect(['not_found', 'revoked']).toContain(childFollowup.outcome);
      }

      // 2. Race password reset against login session creation using a pre-reset password snapshot
      for (let i = 0; i < 5; i++) {
        const preResetHash = `$2a$10$preresethash_iter${i}_1234567890123456789012`;
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: preResetHash },
        });

        const resetTokenHash = tokenService.hashToken(tokenService.generateToken());
        await resetRepo.issueToken({
          userId: user.id,
          tokenHash: resetTokenHash,
          expiresAt: new Date(baseTime.getTime() + 30 * 60_000),
          now: baseTime,
        });

        const loginRefreshHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        const raceTime = new Date(baseTime.getTime() + 10_000);

        const [resetOutcome, loginSessionResult] = await Promise.all([
          resetRepo.consumeAndResetPassword({
            tokenHash: resetTokenHash,
            newPasswordHash: `$2a$10$postresethash_iter${i}_123456789012345678901`,
            now: raceTime,
          }),
          sessionRepo.createAuthenticatedSession({
            userId: user.id,
            tokenFamilyId: randomUUID(),
            refreshTokenHash: loginRefreshHash,
            parentSessionId: null,
            expiresAt: sessionExpiry,
            expectedPasswordHash: preResetHash,
          }),
        ]);

        expect(resetOutcome).toBe('reset');
        expect(['created', 'stale_credentials']).toContain(loginSessionResult.outcome);

        // Zero active sessions may remain for the user once reset finishes
        const activeSessions = await prisma.userSession.findMany({
          where: { userId: user.id, revokedAt: null },
        });
        expect(activeSessions).toHaveLength(0);
      }
    } finally {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });

  it('prechecks token eligibility without mutating state and claims durable encrypted outbox events atomically with SKIP LOCKED', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const resetRepo = new PrismaPasswordResetTokenRepository(prisma);
    const outboxRepo = new PrismaPasswordResetOutboxRepository(prisma);
    const tokenService = new CryptoVerificationTokenService();
    const cipher = new OutboxPayloadCipher('0123456789abcdef0123456789abcdef0123456789abcdef');

    const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const activeEmail = `test.outbox.active.${suffix}@example.com`;
    const unverifiedEmail = `test.outbox.unverified.${suffix}@example.com`;
    const createdUserIds: string[] = [];

    try {
      const now = new Date('2026-11-27T11:00:00Z');
      const activeUser = await userRepo.create({
        displayName: 'Outbox Active',
        email: activeEmail,
        passwordHash: '$2a$10$activeuserhash1234567890123456789012345678901',
        status: UserStatus.ACTIVE,
      });
      createdUserIds.push(activeUser.id);
      await prisma.user.update({
        where: { id: activeUser.id },
        data: { emailVerifiedAt: new Date('2026-11-26T08:00:00Z') },
      });

      const unverifiedUser = await userRepo.create({
        displayName: 'Outbox Unverified',
        email: unverifiedEmail,
        passwordHash: '$2a$10$unverifiedhash12345678901234567890123456789',
        status: UserStatus.ACTIVE,
      });
      createdUserIds.push(unverifiedUser.id);

      const rawToken = tokenService.generateToken();
      const tokenHash = tokenService.hashToken(rawToken);
      const resetUrl = tokenService.buildPasswordResetUrl('https://jobs.example.com', rawToken);

      await resetRepo.issueTokenWithOutbox({
        userId: activeUser.id,
        tokenHash,
        expiresAt: new Date(now.getTime() + 30 * 60_000),
        now,
        outboxEvent: {
          eventType: PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE,
          aggregateType: 'user',
          aggregateId: activeUser.id,
          payload: cipher.sealJson({
            to: activeEmail,
            displayName: 'Outbox Active',
            resetUrl,
            expiresInMinutes: 30,
          }),
        },
      });

      const unverifiedHash = tokenService.hashToken(tokenService.generateToken());
      await resetRepo.issueToken({
        userId: unverifiedUser.id,
        tokenHash: unverifiedHash,
        expiresAt: new Date(now.getTime() + 30 * 60_000),
        now,
      });

      // Eligibility prechecks accurately reflect state
      expect(await resetRepo.hasEligibleToken(tokenHash, now)).toBe(true);
      expect(await resetRepo.hasEligibleToken('nonexistent-hash', now)).toBe(false);
      expect(await resetRepo.hasEligibleToken(unverifiedHash, now)).toBe(false);
      expect(
        await resetRepo.hasEligibleToken(tokenHash, new Date(now.getTime() + 31 * 60_000)),
      ).toBe(false);

      // Persisted outbox row stores sealed payload without plaintext token or URL
      const persistedEvents = await prisma.outboxEvent.findMany({
        where: { aggregateId: activeUser.id },
      });
      expect(persistedEvents).toHaveLength(1);
      expect(persistedEvents[0]!.status).toBe(OutboxStatus.PENDING);
      expect(JSON.stringify(persistedEvents[0]!.payload)).not.toContain(rawToken);
      expect(JSON.stringify(persistedEvents[0]!.payload)).not.toContain(resetUrl);

      // Concurrent workers claim at most once with FOR UPDATE SKIP LOCKED
      const [batchA, batchB] = await Promise.all([
        outboxRepo.claimPendingBatch(10, now, 60_000),
        outboxRepo.claimPendingBatch(10, now, 60_000),
      ]);
      const claimedForUser = [...batchA, ...batchB].filter(
        (row) => row.aggregateId === activeUser.id,
      );
      expect(claimedForUser).toHaveLength(1);

      await outboxRepo.markPublished(claimedForUser[0]!.id);
      const published = await prisma.outboxEvent.findUnique({
        where: { id: claimedForUser[0]!.id },
      });
      expect(published?.status).toBe(OutboxStatus.PUBLISHED);
      expect(published?.payload).toEqual({ redacted: true });
    } finally {
      if (createdUserIds.length > 0) {
        await prisma.outboxEvent.deleteMany({
          where: { aggregateId: { in: createdUserIds } },
        });
      }
      await prisma.user.deleteMany({
        where: { email: { in: [activeEmail, unverifiedEmail] } },
      });
    }
  });
});
