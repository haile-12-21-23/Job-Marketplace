import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  INITIAL_PERMISSIONS,
  INITIAL_PLATFORM_ROLES,
  INITIAL_ROLE_PERMISSION_MAP,
} from './authorization.catalogue.js';

export interface SeedPlatformRbacResult {
  rolesUpserted: number;
  permissionsUpserted: number;
  rolePermissionPairsProcessed: number;
}

/**
 * Idempotently seeds baseline platform roles, permission codes, and explicit RolePermission mappings.
 * Never deletes unrelated custom roles/permissions/grants and never assigns platform roles to users.
 */
export async function seedPlatformRbac(client: PrismaClient): Promise<SeedPlatformRbacResult> {
  const roleIdByCode = new Map<string, string>();
  for (const role of INITIAL_PLATFORM_ROLES) {
    const upserted = await client.platformRole.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
      },
    });
    roleIdByCode.set(role.code, upserted.id);
  }

  const permissionIdByCode = new Map<string, string>();
  for (const permission of INITIAL_PERMISSIONS) {
    const upserted = await client.permission.upsert({
      where: { code: permission.code },
      update: {
        description: permission.description,
      },
      create: {
        code: permission.code,
        description: permission.description,
      },
    });
    permissionIdByCode.set(permission.code, upserted.id);
  }

  const pairs: Array<{ roleId: string; permissionId: string }> = [];
  for (const role of INITIAL_PLATFORM_ROLES) {
    const roleId = roleIdByCode.get(role.code);
    if (!roleId) continue;

    for (const permissionCode of INITIAL_ROLE_PERMISSION_MAP[role.code]) {
      const permissionId = permissionIdByCode.get(permissionCode);
      if (permissionId) {
        pairs.push({ roleId, permissionId });
      }
    }
  }

  if (pairs.length > 0) {
    await client.rolePermission.createMany({
      data: pairs,
      skipDuplicates: true,
    });
  }

  return {
    rolesUpserted: roleIdByCode.size,
    permissionsUpserted: permissionIdByCode.size,
    rolePermissionPairsProcessed: pairs.length,
  };
}
