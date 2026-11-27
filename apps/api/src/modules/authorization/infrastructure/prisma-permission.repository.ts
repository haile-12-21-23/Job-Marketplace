import { PrismaClient } from '../../../generated/prisma/client.js';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import { isUuid } from '../domain/principal.js';
import type { PermissionRepository } from '../ports/permission.repository.js';

/**
 * Resolves persisted platform permissions strictly through UserPlatformRole -> PlatformRole ->
 * RolePermission -> Permission for active users. Never synthesizes wildcards or admin bypasses.
 */
export class PrismaPermissionRepository implements PermissionRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  async hasUserPermission(userId: string, permissionCode: string): Promise<boolean> {
    const normalizedCode = permissionCode.trim();
    if (!isUuid(userId) || normalizedCode.length === 0) {
      return false;
    }

    const grant = await this.client.rolePermission.findFirst({
      where: {
        permission: {
          code: normalizedCode,
        },
        role: {
          userPlatformRoles: {
            some: {
              userId,
              user: {
                status: UserStatus.ACTIVE,
              },
            },
          },
        },
      },
      select: {
        roleId: true,
      },
    });

    return grant !== null;
  }

  async listUserPermissionCodes(userId: string): Promise<string[]> {
    if (!isUuid(userId)) {
      return [];
    }

    const permissions = await this.client.permission.findMany({
      where: {
        rolePermissions: {
          some: {
            role: {
              userPlatformRoles: {
                some: {
                  userId,
                  user: {
                    status: UserStatus.ACTIVE,
                  },
                },
              },
            },
          },
        },
      },
      select: {
        code: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return permissions.map((entry) => entry.code);
  }
}
