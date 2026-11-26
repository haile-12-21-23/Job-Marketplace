import { PrismaClient } from '../../../generated/prisma/client.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import type {
  ConsumeVerificationTokenOutcome,
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
  IssueVerificationTokenInput,
} from '../ports/email-verification-token.repository.js';

class VerificationRollbackSignal extends Error {
  constructor() {
    super('Verification aborted due to concurrent or invalid state');
    this.name = 'VerificationRollbackSignal';
  }
}

export class PrismaEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  async issueToken(input: IssueVerificationTokenInput): Promise<EmailVerificationTokenRecord> {
    return this.client.$transaction(async (tx) => {
      // Lock the user row to serialize concurrent token issuance even when no active token rows exist
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;

      // Supersede any previously active tokens for this user
      await tx.emailVerificationToken.updateMany({
        where: {
          userId: input.userId,
          usedAt: null,
        },
        data: {
          usedAt: input.now,
        },
      });

      const created = await tx.emailVerificationToken.create({
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
    });
  }

  async consumeAndVerifyUser(
    tokenHash: string,
    now: Date,
  ): Promise<ConsumeVerificationTokenOutcome> {
    try {
      return await this.client.$transaction(async (tx) => {
        const record = await tx.emailVerificationToken.findUnique({
          where: { tokenHash },
          include: {
            user: {
              select: {
                id: true,
                emailVerifiedAt: true,
              },
            },
          },
        });

        if (
          !record ||
          record.usedAt !== null ||
          record.expiresAt.getTime() <= now.getTime() ||
          record.user.emailVerifiedAt !== null
        ) {
          return 'invalid_or_expired';
        }

        // Atomic conditional update ensures concurrent requests cannot both consume the token
        const consumedToken = await tx.emailVerificationToken.updateMany({
          where: {
            id: record.id,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
          },
        });

        if (consumedToken.count !== 1) {
          throw new VerificationRollbackSignal();
        }

        // Set emailVerifiedAt only once when currently null
        const verifiedUser = await tx.user.updateMany({
          where: {
            id: record.userId,
            emailVerifiedAt: null,
          },
          data: {
            emailVerifiedAt: now,
          },
        });

        if (verifiedUser.count !== 1) {
          throw new VerificationRollbackSignal();
        }

        return 'verified';
      });
    } catch (err) {
      if (err instanceof VerificationRollbackSignal) {
        return 'invalid_or_expired';
      }
      throw err;
    }
  }
}
