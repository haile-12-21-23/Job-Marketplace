import { PrismaClient } from '../../../generated/prisma/client.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import { isUuid } from '../domain/principal.js';
import type {
  EmployerAccessRepository,
  EmployerAccountAccessRecord,
} from '../ports/employer-access.repository.js';

/**
 * Resolves persisted EmployerAccount ownership and EmployerMembership state from PostgreSQL.
 */
export class PrismaEmployerAccessRepository implements EmployerAccessRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  async findAccountAccessForUser(
    employerAccountId: string,
    userId: string,
  ): Promise<EmployerAccountAccessRecord | null> {
    if (!isUuid(employerAccountId) || !isUuid(userId)) {
      return null;
    }

    const account = await this.client.employerAccount.findUnique({
      where: { id: employerAccountId },
      select: {
        id: true,
        ownerUserId: true,
        status: true,
        type: true,
        memberships: {
          where: { userId },
          select: {
            id: true,
            role: true,
            status: true,
          },
          take: 1,
        },
      },
    });

    if (!account) {
      return null;
    }

    const membership = account.memberships[0] ?? null;

    return {
      employerAccountId: account.id,
      ownerUserId: account.ownerUserId,
      accountStatus: account.status,
      accountType: account.type,
      membership: membership
        ? {
            id: membership.id,
            role: membership.role,
            status: membership.status,
          }
        : null,
    };
  }
}
