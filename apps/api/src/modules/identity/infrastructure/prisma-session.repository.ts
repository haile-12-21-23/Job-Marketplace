import { PrismaClient } from '../../../generated/prisma/client.js';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import type {
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

interface LockedFamilyRow {
  token_family_id: string;
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
          await tx.userSession.updateMany({
            where: {
              tokenFamilyId: locked.token_family_id,
              revokedAt: null,
            },
            data: {
              revokedAt: input.now,
            },
          });

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
        await tx.userSession.updateMany({
          where: {
            tokenFamilyId: locked.token_family_id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

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
      const lockedRows = await tx.$queryRaw<LockedFamilyRow[]>`
        SELECT token_family_id
        FROM user_sessions
        WHERE refresh_token_hash = ${refreshTokenHash}
        FOR UPDATE
      `;

      const locked = lockedRows[0];
      if (!locked) {
        return { revokedCount: 0, tokenFamilyId: null };
      }

      const updated = await tx.userSession.updateMany({
        where: {
          tokenFamilyId: locked.token_family_id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      return {
        revokedCount: updated.count,
        tokenFamilyId: locked.token_family_id,
      };
    });
  }
}
