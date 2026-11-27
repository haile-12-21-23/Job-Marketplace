import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import type {
  CreateAuthenticatedSessionInput,
  CreateAuthenticatedSessionResult,
  CreateSessionInput,
  ReplayCheckResult,
  RevokeFamilyResult,
  RotateSessionInput,
  RotateSessionResult,
  SessionRepository,
  SessionRotationCandidate,
  UserSessionRecord,
} from '../ports/session.repository.js';

interface LockedSessionRow {
  id: string;
  user_id: string;
  token_family_id: string;
  parent_session_id: string | null;
  expires_at: Date;
  revoked_at: Date | null;
}

interface FamilyLookupRow {
  token_family_id: string;
}

interface SessionOwnerRow {
  user_id: string;
}

interface LockedUserCredentialRow {
  id: string;
  password_hash: string;
  status: UserStatus;
  email_verified_at: Date | null;
}

function deriveFamilyLockKeys(tokenFamilyId: string): [number, number] {
  const digest = createHash('sha256').update(tokenFamilyId, 'utf8').digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

/**
 * Lock hierarchy across identity transactions (prevents deadlocks):
 *   1. Transaction-scoped family advisory lock (pg_advisory_xact_lock)
 *   2. Owning user row lock (users FOR SHARE in session ops, FOR UPDATE in password reset)
 *   3. Session / reset-token row locks and mutations
 */
async function acquireFamilyLockAndUserShareLock(
  tx: Prisma.TransactionClient,
  refreshTokenHash: string,
): Promise<{ tokenFamilyId: string; userId: string } | null> {
  const familyRows = await tx.$queryRaw<FamilyLookupRow[]>`
    SELECT token_family_id
    FROM user_sessions
    WHERE refresh_token_hash = ${refreshTokenHash}
  `;

  const familyRow = familyRows[0];
  if (!familyRow) {
    return null;
  }

  const [keyHigh, keyLow] = deriveFamilyLockKeys(familyRow.token_family_id);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${keyHigh}::int4, ${keyLow}::int4)`;

  // Resolve userId after obtaining the family advisory lock, then acquire users FOR SHARE
  // before taking any session row locks so password-reset FOR UPDATE serializes cleanly.
  const ownerRows = await tx.$queryRaw<SessionOwnerRow[]>`
    SELECT user_id
    FROM user_sessions
    WHERE refresh_token_hash = ${refreshTokenHash}
  `;

  const ownerRow = ownerRows[0];
  if (!ownerRow) {
    return null;
  }

  await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerRow.user_id}::uuid FOR SHARE`;

  return {
    tokenFamilyId: familyRow.token_family_id,
    userId: ownerRow.user_id,
  };
}

async function revokeActiveFamilyRows(
  tx: Prisma.TransactionClient,
  tokenFamilyId: string,
  now: Date,
): Promise<number> {
  const updated = await tx.userSession.updateMany({
    where: {
      tokenFamilyId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });
  return updated.count;
}

function mapSessionRecord(session: {
  id: string;
  userId: string;
  tokenFamilyId: string;
  refreshTokenHash: string;
  parentSessionId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}): UserSessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    tokenFamilyId: session.tokenFamilyId,
    refreshTokenHash: session.refreshTokenHash,
    parentSessionId: session.parentSessionId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    createdAt: session.createdAt,
  };
}

export class PrismaSessionRepository implements SessionRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  async create(input: CreateSessionInput): Promise<UserSessionRecord> {
    const session = await this.client.userSession.create({
      data: {
        userId: input.userId,
        tokenFamilyId: input.tokenFamilyId,
        refreshTokenHash: input.refreshTokenHash,
        parentSessionId: input.parentSessionId,
        expiresAt: input.expiresAt,
        revokedAt: null,
      },
    });

    return mapSessionRecord(session);
  }

  async createAuthenticatedSession(
    input: CreateAuthenticatedSessionInput,
  ): Promise<CreateAuthenticatedSessionResult> {
    return this.client.$transaction(async (tx) => {
      // Lock the owning user row (FOR SHARE) to serialize against password reset (FOR UPDATE)
      // and ensure a concurrent password change rejects stale pre-reset credential checks.
      const userRows = await tx.$queryRaw<LockedUserCredentialRow[]>`
        SELECT id, password_hash, status, email_verified_at
        FROM users
        WHERE id = ${input.userId}::uuid
        FOR SHARE
      `;

      const userRow = userRows[0];
      if (
        !userRow ||
        userRow.password_hash !== input.expectedPasswordHash ||
        userRow.status !== UserStatus.ACTIVE ||
        userRow.email_verified_at === null
      ) {
        return { outcome: 'stale_credentials' };
      }

      const session = await tx.userSession.create({
        data: {
          userId: input.userId,
          tokenFamilyId: input.tokenFamilyId,
          refreshTokenHash: input.refreshTokenHash,
          parentSessionId: input.parentSessionId,
          expiresAt: input.expiresAt,
          revokedAt: null,
        },
      });

      return {
        outcome: 'created',
        session: mapSessionRecord(session),
      };
    });
  }

  async findRotationCandidateByTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionRotationCandidate | null> {
    const record = await this.client.userSession.findUnique({
      where: { refreshTokenHash },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            status: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (!record) {
      return null;
    }

    return {
      session: mapSessionRecord(record),
      user: record.user,
    };
  }

  async rotateSession(input: RotateSessionInput): Promise<RotateSessionResult> {
    return this.client.$transaction(async (tx) => {
      const locks = await acquireFamilyLockAndUserShareLock(tx, input.presentedTokenHash);
      if (!locks) {
        return { outcome: 'not_found' };
      }

      const lockedRows = await tx.$queryRaw<LockedSessionRow[]>`
        SELECT id, user_id, token_family_id, parent_session_id, expires_at, revoked_at
        FROM user_sessions
        WHERE refresh_token_hash = ${input.presentedTokenHash}
        FOR UPDATE
      `;

      const locked = lockedRows[0];
      if (!locked) {
        return { outcome: 'not_found' };
      }

      if (locked.revoked_at !== null) {
        const child = await tx.userSession.findFirst({
          where: { parentSessionId: locked.id },
          select: { id: true },
        });

        if (child) {
          await revokeActiveFamilyRows(tx, locked.token_family_id, input.now);

          return {
            outcome: 'replayed',
            tokenFamilyId: locked.token_family_id,
          };
        }

        return { outcome: 'revoked' };
      }

      const expiresAt = new Date(locked.expires_at);
      if (expiresAt.getTime() <= input.now.getTime()) {
        return { outcome: 'expired' };
      }

      const user = await tx.user.findUnique({
        where: { id: locked.user_id },
        select: {
          id: true,
          displayName: true,
          email: true,
          status: true,
          emailVerifiedAt: true,
        },
      });

      if (!user || user.status !== UserStatus.ACTIVE || user.emailVerifiedAt === null) {
        return { outcome: 'user_ineligible' };
      }

      await tx.userSession.update({
        where: { id: locked.id },
        data: { revokedAt: input.now },
      });

      const createdChild = await tx.userSession.create({
        data: {
          id: input.newSessionId,
          userId: locked.user_id,
          tokenFamilyId: locked.token_family_id,
          refreshTokenHash: input.newRefreshTokenHash,
          parentSessionId: locked.id,
          expiresAt,
          revokedAt: null,
        },
      });

      return {
        outcome: 'rotated',
        session: mapSessionRecord(createdChild),
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
        },
      };
    });
  }

  async revokeFamilyIfReplayed(refreshTokenHash: string, now: Date): Promise<ReplayCheckResult> {
    return this.client.$transaction(async (tx) => {
      const locks = await acquireFamilyLockAndUserShareLock(tx, refreshTokenHash);
      if (!locks) {
        return { outcome: 'not_found' };
      }

      const lockedRows = await tx.$queryRaw<LockedSessionRow[]>`
        SELECT id, user_id, token_family_id, parent_session_id, expires_at, revoked_at
        FROM user_sessions
        WHERE refresh_token_hash = ${refreshTokenHash}
        FOR UPDATE
      `;

      const locked = lockedRows[0];
      if (!locked) {
        return { outcome: 'not_found' };
      }

      const child = await tx.userSession.findFirst({
        where: { parentSessionId: locked.id },
        select: { id: true },
      });

      if (child) {
        await revokeActiveFamilyRows(tx, locked.token_family_id, now);

        return {
          outcome: 'replayed',
          tokenFamilyId: locked.token_family_id,
        };
      }

      return { outcome: 'revoked' };
    });
  }

  async revokeFamilyByTokenHash(refreshTokenHash: string, now: Date): Promise<RevokeFamilyResult> {
    return this.client.$transaction(async (tx) => {
      const locks = await acquireFamilyLockAndUserShareLock(tx, refreshTokenHash);
      if (!locks) {
        return { revokedCount: 0, tokenFamilyId: null };
      }

      const revokedCount = await revokeActiveFamilyRows(tx, locks.tokenFamilyId, now);

      return {
        revokedCount,
        tokenFamilyId: locks.tokenFamilyId,
      };
    });
  }
}
