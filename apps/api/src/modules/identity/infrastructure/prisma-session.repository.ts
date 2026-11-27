import { PrismaClient } from '../../../generated/prisma/client.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import type {
  CreateSessionInput,
  SessionRepository,
  UserSessionRecord,
} from '../ports/session.repository.js';

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
}
