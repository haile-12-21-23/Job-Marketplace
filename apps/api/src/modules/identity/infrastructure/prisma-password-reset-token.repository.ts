import { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { OutboxStatus, UserStatus } from '../../../generated/prisma/enums.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import type {
  ConsumePasswordResetTokenInput,
  ConsumePasswordResetTokenOutcome,
  IssuePasswordResetTokenInput,
  IssuePasswordResetTokenWithOutboxInput,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from '../ports/password-reset-token.repository.js';

class PasswordResetRollbackSignal extends Error {
  constructor() {
    super('Password reset aborted due to concurrent or invalid token state');
    this.name = 'PasswordResetRollbackSignal';
  }
}

interface LockedUserRow {
  id: string;
  status: UserStatus;
  email_verified_at: Date | null;
}

interface LockedResetTokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}

export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  private async issueTokenInTx(
    tx: Prisma.TransactionClient,
    input: IssuePasswordResetTokenInput,
  ): Promise<PasswordResetTokenRecord> {
    // Lock the user row first (consistent lock order: users -> password_reset_tokens)
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;

    // Supersede any previously active password reset tokens for this user
    await tx.passwordResetToken.updateMany({
      where: {
        userId: input.userId,
        usedAt: null,
      },
      data: {
        usedAt: input.now,
      },
    });

    const created = await tx.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        usedAt: null,
      },
    });

    return {
      id: created.id,
      userId: created.userId,
      tokenHash: created.tokenHash,
      expiresAt: created.expiresAt,
      usedAt: created.usedAt,
      createdAt: created.createdAt,
    };
  }

  async issueToken(input: IssuePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    return this.client.$transaction(async (tx) => this.issueTokenInTx(tx, input));
  }

  async issueTokenWithOutbox(
    input: IssuePasswordResetTokenWithOutboxInput,
  ): Promise<PasswordResetTokenRecord> {
    return this.client.$transaction(async (tx) => {
      const created = await this.issueTokenInTx(tx, input);

      await tx.outboxEvent.create({
        data: {
          eventType: input.outboxEvent.eventType,
          aggregateType: input.outboxEvent.aggregateType,
          aggregateId: input.outboxEvent.aggregateId,
          payload: input.outboxEvent.payload as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
          availableAt: input.now,
        },
      });

      return created;
    });
  }

  async hasEligibleToken(tokenHash: string, now: Date): Promise<boolean> {
    const row = await this.client.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        usedAt: true,
        expiresAt: true,
        user: {
          select: {
            status: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (!row || row.usedAt !== null || row.expiresAt.getTime() <= now.getTime()) {
      return false;
    }

    return row.user.status === UserStatus.ACTIVE && row.user.emailVerifiedAt !== null;
  }

  async consumeAndResetPassword(
    input: ConsumePasswordResetTokenInput,
  ): Promise<ConsumePasswordResetTokenOutcome> {
    try {
      return await this.client.$transaction(async (tx) => {
        // Non-locking lookup solely to establish the owning userId before acquiring locks
        const candidate = await tx.passwordResetToken.findUnique({
          where: { tokenHash: input.tokenHash },
          select: { userId: true },
        });

        if (!candidate) {
          return 'invalid_or_expired';
        }

        // Lock user row first (FOR UPDATE) to serialize against refresh (FOR SHARE) and login (FOR SHARE)
        const lockedUsers = await tx.$queryRaw<LockedUserRow[]>`
          SELECT id, status, email_verified_at
          FROM users
          WHERE id = ${candidate.userId}::uuid
          FOR UPDATE
        `;
        const user = lockedUsers[0];
        if (!user || user.status !== UserStatus.ACTIVE || user.email_verified_at === null) {
          return 'invalid_or_expired';
        }

        // Lock the reset token row second (same users -> password_reset_tokens order as issueToken)
        const lockedTokens = await tx.$queryRaw<LockedResetTokenRow[]>`
          SELECT id, user_id, expires_at, used_at
          FROM password_reset_tokens
          WHERE token_hash = ${input.tokenHash}
          FOR UPDATE
        `;
        const tokenRow = lockedTokens[0];
        if (
          !tokenRow ||
          tokenRow.user_id !== user.id ||
          tokenRow.used_at !== null ||
          new Date(tokenRow.expires_at).getTime() <= input.now.getTime()
        ) {
          return 'invalid_or_expired';
        }

        const consumedToken = await tx.passwordResetToken.updateMany({
          where: {
            id: tokenRow.id,
            usedAt: null,
            expiresAt: { gt: input.now },
          },
          data: {
            usedAt: input.now,
          },
        });

        if (consumedToken.count !== 1) {
          throw new PasswordResetRollbackSignal();
        }

        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: input.newPasswordHash },
        });

        // Revoke every active session across all token families/devices for this user
        await tx.userSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
          },
          data: {
            revokedAt: input.now,
          },
        });

        return 'reset';
      });
    } catch (err) {
      if (err instanceof PasswordResetRollbackSignal) {
        return 'invalid_or_expired';
      }
      throw err;
    }
  }
}
