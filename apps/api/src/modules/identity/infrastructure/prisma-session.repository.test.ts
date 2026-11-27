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

  it('rotates atomically with fixed family expiry, revokes replayed family without affecting other families, and enforces row-locked concurrency', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const sessionRepo = new PrismaSessionRepository(prisma);
    const refreshTokenService = new CryptoRefreshTokenService();
    const testEmail = `test.rotate.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;

    try {
      const user = await userRepo.create({
        displayName: 'Rotation Concurrency User',
        email: testEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        status: UserStatus.ACTIVE,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date('2026-11-26T08:00:00Z') },
      });

      const baseTime = new Date('2026-11-26T10:00:00Z');
      const family1Expiry = new Date(baseTime.getTime() + 30 * 86_400_000);
      const family1Id = randomUUID();
      const family2Id = randomUUID();

      const rootHash1 = refreshTokenService.hashToken(refreshTokenService.generateToken());
      const rootSession1 = await sessionRepo.create({
        userId: user.id,
        tokenFamilyId: family1Id,
        refreshTokenHash: rootHash1,
        parentSessionId: null,
        expiresAt: family1Expiry,
      });

      const unrelatedHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
      const unrelatedSession = await sessionRepo.create({
        userId: user.id,
        tokenFamilyId: family2Id,
        refreshTokenHash: unrelatedHash,
        parentSessionId: null,
        expiresAt: family1Expiry,
      });

      // 1. Rotate root -> child1 (5 days later; child must keep original family1Expiry)
      const rotate1Time = new Date(baseTime.getTime() + 5 * 86_400_000);
      const child1Id = randomUUID();
      const child1Hash = refreshTokenService.hashToken(refreshTokenService.generateToken());
      const rotate1 = await sessionRepo.rotateSession({
        presentedTokenHash: rootHash1,
        newSessionId: child1Id,
        newRefreshTokenHash: child1Hash,
        now: rotate1Time,
      });

      expect(rotate1.outcome).toBe('rotated');
      if (rotate1.outcome === 'rotated') {
        expect(rotate1.session.id).toBe(child1Id);
        expect(rotate1.session.parentSessionId).toBe(rootSession1.id);
        expect(rotate1.session.tokenFamilyId).toBe(family1Id);
        expect(rotate1.session.expiresAt.getTime()).toBe(family1Expiry.getTime());
        expect(rotate1.session.revokedAt).toBeNull();
      }

      const persistedParent = await prisma.userSession.findUnique({
        where: { id: rootSession1.id },
      });
      expect(persistedParent?.revokedAt?.getTime()).toBe(rotate1Time.getTime());

      // 2. Concurrent rotation attempts on child1Hash using real PostgreSQL FOR UPDATE row lock
      const raceTime = new Date(rotate1Time.getTime() + 10_000);
      const [raceA, raceB] = await Promise.all([
        sessionRepo.rotateSession({
          presentedTokenHash: child1Hash,
          newSessionId: randomUUID(),
          newRefreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
          now: raceTime,
        }),
        sessionRepo.rotateSession({
          presentedTokenHash: child1Hash,
          newSessionId: randomUUID(),
          newRefreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
          now: raceTime,
        }),
      ]);

      const outcomes = [raceA.outcome, raceB.outcome].sort();
      expect(outcomes).toEqual(['replayed', 'rotated']);

      // Only one child of child1 should have been created, and the replay path must have revoked it
      const family1Rows = await prisma.userSession.findMany({
        where: { tokenFamilyId: family1Id },
      });
      expect(family1Rows).toHaveLength(3); // root + child1 + race winner grandchild
      expect(family1Rows.every((row) => row.revokedAt !== null)).toBe(true);

      // Unrelated family for the same user must remain active
      const persistedUnrelated = await prisma.userSession.findUnique({
        where: { id: unrelatedSession.id },
      });
      expect(persistedUnrelated?.revokedAt).toBeNull();

      // 3. Logout revokes only the targeted family
      const family3Id = randomUUID();
      const family3Hash = refreshTokenService.hashToken(refreshTokenService.generateToken());
      const family3Session = await sessionRepo.create({
        userId: user.id,
        tokenFamilyId: family3Id,
        refreshTokenHash: family3Hash,
        parentSessionId: null,
        expiresAt: family1Expiry,
      });

      const logoutResult = await sessionRepo.revokeFamilyByTokenHash(family3Hash, raceTime);
      expect(logoutResult).toEqual({ revokedCount: 1, tokenFamilyId: family3Id });

      const afterLogoutFam3 = await prisma.userSession.findUnique({
        where: { id: family3Session.id },
      });
      const afterLogoutFam2 = await prisma.userSession.findUnique({
        where: { id: unrelatedSession.id },
      });
      expect(afterLogoutFam3?.revokedAt).not.toBeNull();
      expect(afterLogoutFam2?.revokedAt).toBeNull();

      // Revoked session without children cannot rotate
      const revokedRotate = await sessionRepo.rotateSession({
        presentedTokenHash: family3Hash,
        newSessionId: randomUUID(),
        newRefreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
        now: raceTime,
      });
      expect(revokedRotate.outcome).toBe('revoked');

      // Expired session cannot rotate
      const expiredRotate = await sessionRepo.rotateSession({
        presentedTokenHash: unrelatedHash,
        newSessionId: randomUUID(),
        newRefreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
        now: family1Expiry,
      });
      expect(expiredRotate.outcome).toBe('expired');
    } finally {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });

  it('serializes ancestor replay and logout against concurrent descendant rotation in PostgreSQL', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const sessionRepo = new PrismaSessionRepository(prisma);
    const refreshTokenService = new CryptoRefreshTokenService();
    const testEmail = `test.ancestor.race.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;

    try {
      const user = await userRepo.create({
        displayName: 'Ancestor Replay Race User',
        email: testEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        status: UserStatus.ACTIVE,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date('2026-11-26T08:00:00Z') },
      });

      const baseTime = new Date('2026-11-26T10:00:00Z');
      const familyExpiry = new Date(baseTime.getTime() + 30 * 86_400_000);
      const unrelatedFamilyId = randomUUID();
      const unrelatedHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
      const unrelatedSession = await sessionRepo.create({
        userId: user.id,
        tokenFamilyId: unrelatedFamilyId,
        refreshTokenHash: unrelatedHash,
        parentSessionId: null,
        expiresAt: familyExpiry,
      });

      // Repeat multiple concurrent iterations to exercise both lock acquisition orders
      for (let i = 0; i < 5; i++) {
        const familyId = randomUUID();
        const rootHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        await sessionRepo.create({
          userId: user.id,
          tokenFamilyId: familyId,
          refreshTokenHash: rootHash,
          parentSessionId: null,
          expiresAt: familyExpiry,
        });

        const childHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        const rotateToChild = await sessionRepo.rotateSession({
          presentedTokenHash: rootHash,
          newSessionId: randomUUID(),
          newRefreshTokenHash: childHash,
          now: new Date(baseTime.getTime() + 1000),
        });
        expect(rotateToChild.outcome).toBe('rotated');

        const grandchildHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        const raceNow = new Date(baseTime.getTime() + 5000);

        const [descendantResult, ancestorReplayResult] = await Promise.all([
          sessionRepo.rotateSession({
            presentedTokenHash: childHash,
            newSessionId: randomUUID(),
            newRefreshTokenHash: grandchildHash,
            now: raceNow,
          }),
          sessionRepo.revokeFamilyIfReplayed(rootHash, raceNow),
        ]);

        expect(ancestorReplayResult).toEqual({ outcome: 'replayed', tokenFamilyId: familyId });
        expect(['rotated', 'revoked']).toContain(descendantResult.outcome);

        // No active session (including any newly inserted grandchild) may remain in the family
        const activeRows = await prisma.userSession.findMany({
          where: { tokenFamilyId: familyId, revokedAt: null },
        });
        expect(activeRows).toHaveLength(0);

        const grandchildFollowup = await sessionRepo.rotateSession({
          presentedTokenHash: grandchildHash,
          newSessionId: randomUUID(),
          newRefreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
          now: new Date(raceNow.getTime() + 1000),
        });
        expect(['not_found', 'revoked']).toContain(grandchildFollowup.outcome);
      }

      // Also verify logout using an ancestor token racing against descendant rotation leaves zero active rows
      for (let i = 0; i < 5; i++) {
        const logoutFamilyId = randomUUID();
        const rootHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        await sessionRepo.create({
          userId: user.id,
          tokenFamilyId: logoutFamilyId,
          refreshTokenHash: rootHash,
          parentSessionId: null,
          expiresAt: familyExpiry,
        });

        const childHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        await sessionRepo.rotateSession({
          presentedTokenHash: rootHash,
          newSessionId: randomUUID(),
          newRefreshTokenHash: childHash,
          now: new Date(baseTime.getTime() + 1000),
        });

        const grandchildHash = refreshTokenService.hashToken(refreshTokenService.generateToken());
        const raceNow = new Date(baseTime.getTime() + 5000);
        const [descendantResult, logoutResult] = await Promise.all([
          sessionRepo.rotateSession({
            presentedTokenHash: childHash,
            newSessionId: randomUUID(),
            newRefreshTokenHash: grandchildHash,
            now: raceNow,
          }),
          sessionRepo.revokeFamilyByTokenHash(rootHash, raceNow),
        ]);

        expect(logoutResult.tokenFamilyId).toBe(logoutFamilyId);
        expect(['rotated', 'revoked']).toContain(descendantResult.outcome);

        const activeRows = await prisma.userSession.findMany({
          where: { tokenFamilyId: logoutFamilyId, revokedAt: null },
        });
        expect(activeRows).toHaveLength(0);

        const grandchildFollowup = await sessionRepo.rotateSession({
          presentedTokenHash: grandchildHash,
          newSessionId: randomUUID(),
          newRefreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
          now: new Date(raceNow.getTime() + 1000),
        });
        expect(['not_found', 'revoked']).toContain(grandchildFollowup.outcome);
      }

      // Unrelated family must remain untouched and active
      const persistedUnrelated = await prisma.userSession.findUnique({
        where: { id: unrelatedSession.id },
      });
      expect(persistedUnrelated?.revokedAt).toBeNull();
    } finally {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    }
  });
});
