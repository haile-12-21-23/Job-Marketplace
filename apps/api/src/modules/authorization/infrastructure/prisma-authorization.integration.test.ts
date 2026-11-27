import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import {
  EmployerRole,
  EmployerStatus,
  EmployerType,
  MembershipStatus,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { disconnectDatabase, getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { JoseAccessTokenService } from '../../identity/domain/access-token.js';
import { CryptoRefreshTokenService } from '../../identity/domain/refresh-token.js';
import { PrismaSessionRepository } from '../../identity/infrastructure/prisma-session.repository.js';
import { PrismaUserRepository } from '../../identity/infrastructure/prisma-user.repository.js';
import {
  INITIAL_PERMISSIONS,
  INITIAL_ROLE_PERMISSION_MAP,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_CODES,
} from '../authorization.catalogue.js';
import { AuthorizationService } from '../application/authorization.service.js';
import { seedPlatformRbac } from '../seed-platform-rbac.js';
import { PrismaEmployerAccessRepository } from './prisma-employer-access.repository.js';
import { PrismaPermissionRepository } from './prisma-permission.repository.js';

describe('Authorization Prisma Integration & RBAC Seed', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('seeds baseline roles and permission matrix idempotently without deleting unrelated custom RBAC data', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const customSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const customRoleCode = `CUSTOM_ROLE_${customSuffix}`;
    const customPermissionCode = `custom.perm.${customSuffix}`;

    try {
      // Pre-create custom role, permission, and grant that seeding must preserve
      const customRole = await prisma.platformRole.create({
        data: {
          code: customRoleCode,
          name: 'Custom Temporary Role',
          description: 'Must survive seed runs',
        },
      });
      const customPermission = await prisma.permission.create({
        data: {
          code: customPermissionCode,
          description: 'Custom permission',
        },
      });
      await prisma.rolePermission.create({
        data: {
          roleId: customRole.id,
          permissionId: customPermission.id,
        },
      });

      // Run seed twice to prove strict idempotency
      await seedPlatformRbac(prisma);
      await seedPlatformRbac(prisma);

      const seededRoles = await prisma.platformRole.findMany({
        where: { code: { in: Object.values(PLATFORM_ROLE_CODES) } },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
      expect(seededRoles).toHaveLength(4);

      for (const role of seededRoles) {
        const expectedCodes = [
          ...INITIAL_ROLE_PERMISSION_MAP[role.code as keyof typeof INITIAL_ROLE_PERMISSION_MAP],
        ].sort();
        const actualCodes = role.rolePermissions.map((rp) => rp.permission.code).sort();
        expect(actualCodes).toEqual(expectedCodes);
      }

      // SUPER_ADMIN must have explicit RolePermission rows for the entire catalogue
      const superAdmin = seededRoles.find((r) => r.code === PLATFORM_ROLE_CODES.SUPER_ADMIN)!;
      expect(superAdmin.rolePermissions).toHaveLength(INITIAL_PERMISSIONS.length);

      // Unrelated custom role, permission, and mapping remain intact
      const preservedMapping = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: customRole.id,
            permissionId: customPermission.id,
          },
        },
      });
      expect(preservedMapping).not.toBeNull();
    } finally {
      await prisma.platformRole.deleteMany({ where: { code: customRoleCode } });
      await prisma.permission.deleteMany({ where: { code: customPermissionCode } });
    }
  });

  it('resolves live sessions, persisted RBAC grants, and employer ownership/membership against PostgreSQL', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    await seedPlatformRbac(prisma);

    const userRepo = new PrismaUserRepository(prisma);
    const sessionRepo = new PrismaSessionRepository(prisma);
    const permissionRepo = new PrismaPermissionRepository(prisma);
    const employerAccessRepo = new PrismaEmployerAccessRepository(prisma);
    const refreshTokenService = new CryptoRefreshTokenService();
    const accessTokenService = new JoseAccessTokenService({
      secret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ttlSeconds: 900,
    });

    const authService = new AuthorizationService({
      accessTokenService,
      sessionRepository: sessionRepo,
      permissionRepository: permissionRepo,
      employerAccessRepository: employerAccessRepo,
    });

    const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const modEmail = `test.rbac.mod.${suffix}@example.com`;
    const memberEmail = `test.rbac.member.${suffix}@example.com`;

    try {
      const modUser = await userRepo.create({
        displayName: 'Moderator User',
        email: modEmail,
        passwordHash: '$2a$10$moderatorhash1234567890123456789012345678901',
        status: UserStatus.ACTIVE,
      });
      const memberUser = await userRepo.create({
        displayName: 'Employer Member User',
        email: memberEmail,
        passwordHash: '$2a$10$memberhash1234567890123456789012345678901234',
        status: UserStatus.ACTIVE,
      });

      const verifiedAt = new Date('2026-11-27T08:00:00Z');
      await prisma.user.updateMany({
        where: { id: { in: [modUser.id, memberUser.id] } },
        data: { emailVerifiedAt: verifiedAt },
      });

      // Live session lookup by (sid, sub)
      const session = await sessionRepo.create({
        userId: modUser.id,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
        parentSessionId: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      const { token } = await accessTokenService.sign({
        userId: modUser.id,
        sessionId: session.id,
      });

      const principal = await authService.authenticateBearerHeader(`Bearer ${token}`);
      expect(principal).toEqual({ userId: modUser.id, sessionId: session.id });

      // Mismatched (sid, wrongUserId) returns null -> 401
      expect(
        await sessionRepo.findSessionCandidateByIdAndUserId(session.id, memberUser.id),
      ).toBeNull();

      // Assign JOB_MODERATOR role -> gains jobs.moderate only, not reports.manage
      const modRole = await prisma.platformRole.findUniqueOrThrow({
        where: { code: PLATFORM_ROLE_CODES.JOB_MODERATOR },
      });
      await prisma.userPlatformRole.create({
        data: {
          userId: modUser.id,
          roleId: modRole.id,
        },
      });

      await expect(
        authService.assertPermission(principal, PLATFORM_PERMISSIONS.JOBS_MODERATE),
      ).resolves.toBeUndefined();
      await expect(
        authService.assertPermission(principal, PLATFORM_PERMISSIONS.REPORTS_MANAGE),
      ).rejects.toMatchObject({ statusCode: 403 });

      // Revoking role grant immediately revokes permission on next lookup
      await prisma.userPlatformRole.delete({
        where: {
          userId_roleId: {
            userId: modUser.id,
            roleId: modRole.id,
          },
        },
      });
      await expect(
        authService.assertPermission(principal, PLATFORM_PERMISSIONS.JOBS_MODERATE),
      ).rejects.toMatchObject({ statusCode: 403 });

      // Employer ownership & membership persisted checks
      const employerAccount = await prisma.employerAccount.create({
        data: {
          ownerUserId: modUser.id,
          type: EmployerType.ORGANIZATION,
          status: EmployerStatus.ACTIVE,
        },
      });
      await prisma.employerMembership.create({
        data: {
          employerAccountId: employerAccount.id,
          userId: memberUser.id,
          role: EmployerRole.RECRUITER,
          status: MembershipStatus.ACTIVE,
        },
      });

      const ownerAccess = await authService.assertEmployerAccess(principal, {
        employerAccountId: employerAccount.id,
        requireOwner: true,
      });
      expect(ownerAccess.accessType).toBe('owner');
      expect(ownerAccess.role).toBe(EmployerRole.OWNER);

      const memberPrincipal = { userId: memberUser.id, sessionId: randomUUID() };
      const memberAccess = await authService.assertEmployerAccess(memberPrincipal, {
        employerAccountId: employerAccount.id,
        allowedMembershipRoles: [EmployerRole.OWNER, EmployerRole.RECRUITER],
      });
      expect(memberAccess.accessType).toBe('member');
      expect(memberAccess.role).toBe(EmployerRole.RECRUITER);

      // Suspended membership denied with 404
      await prisma.employerMembership.update({
        where: {
          employerAccountId_userId: {
            employerAccountId: employerAccount.id,
            userId: memberUser.id,
          },
        },
        data: { status: MembershipStatus.SUSPENDED },
      });
      await expect(
        authService.assertEmployerAccess(memberPrincipal, {
          employerAccountId: employerAccount.id,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      await prisma.employerAccount.deleteMany({
        where: { ownerUser: { email: { in: [modEmail, memberEmail] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [modEmail, memberEmail] } },
      });
    }
  });
});
