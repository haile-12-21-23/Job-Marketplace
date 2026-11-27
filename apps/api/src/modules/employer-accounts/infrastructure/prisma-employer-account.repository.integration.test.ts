import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import {
  EmployerRole,
  EmployerStatus,
  EmployerType,
  MembershipStatus,
  UserStatus,
  VerificationStatus,
} from '../../../generated/prisma/enums.js';
import { disconnectDatabase, getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { AuthorizationService } from '../../authorization/application/authorization.service.js';
import { PrismaEmployerAccessRepository } from '../../authorization/infrastructure/prisma-employer-access.repository.js';
import { PrismaPermissionRepository } from '../../authorization/infrastructure/prisma-permission.repository.js';
import { JoseAccessTokenService } from '../../identity/domain/access-token.js';
import { PrismaSessionRepository } from '../../identity/infrastructure/prisma-session.repository.js';
import { PrismaUserRepository } from '../../identity/infrastructure/prisma-user.repository.js';
import { PrismaEmployerAccountRepository } from './prisma-employer-account.repository.js';

describe('PrismaEmployerAccountRepository Integration', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('persists individual account + profile atomically, allows updates, isolates org accounts, and rolls back on profile failure', async () => {
    if (!process.env['DATABASE_URL']) {
      return;
    }

    const prisma = getPrismaClient();
    const userRepo = new PrismaUserRepository(prisma);
    const repo = new PrismaEmployerAccountRepository(prisma);
    const authService = new AuthorizationService({
      accessTokenService: new JoseAccessTokenService({
        secret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      }),
      sessionRepository: new PrismaSessionRepository(prisma),
      permissionRepository: new PrismaPermissionRepository(prisma),
      employerAccessRepository: new PrismaEmployerAccessRepository(prisma),
    });

    const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const ownerEmail = `test.emp.owner.${suffix}@example.com`;
    const memberEmail = `test.emp.member.${suffix}@example.com`;

    try {
      const owner = await userRepo.create({
        displayName: 'Individual Owner',
        email: ownerEmail,
        passwordHash: '$2a$10$ownerhash123456789012345678901234567890123',
        status: UserStatus.ACTIVE,
      });
      const member = await userRepo.create({
        displayName: 'Tenant Member',
        email: memberEmail,
        passwordHash: '$2a$10$memberhash12345678901234567890123456789012',
        status: UserStatus.ACTIVE,
      });

      // 1. Atomic create succeeds with expected defaults and no redundant membership/RBAC rows
      const created = await repo.createIndividualAccount({
        ownerUserId: owner.id,
        publicName: 'Bikila Solo Hiring',
        contactPhone: '+251911223344',
        countryCode: 'ET',
        city: 'Addis Ababa',
      });

      expect(created.ownerUserId).toBe(owner.id);
      expect(created.type).toBe(EmployerType.INDIVIDUAL);
      expect(created.status).toBe(EmployerStatus.ACTIVE);
      expect(created.verificationStatus).toBe(VerificationStatus.UNVERIFIED);
      expect(created.profile).toMatchObject({
        publicName: 'Bikila Solo Hiring',
        contactPhone: '+251911223344',
        countryCode: 'ET',
        city: 'Addis Ababa',
      });

      expect(
        await prisma.employerMembership.count({ where: { employerAccountId: created.id } }),
      ).toBe(0);
      expect(await prisma.userPlatformRole.count({ where: { userId: owner.id } })).toBe(0);

      // 2. Owner and active member access vs non-owner update restriction
      const ownerPrincipal = { userId: owner.id, sessionId: randomUUID() };
      const memberPrincipal = { userId: member.id, sessionId: randomUUID() };

      await expect(
        authService.assertEmployerAccess(memberPrincipal, { employerAccountId: created.id }),
      ).rejects.toMatchObject({ statusCode: 404 });

      await prisma.employerMembership.create({
        data: {
          employerAccountId: created.id,
          userId: member.id,
          role: EmployerRole.RECRUITER,
          status: MembershipStatus.ACTIVE,
        },
      });

      await expect(
        authService.assertEmployerAccess(memberPrincipal, { employerAccountId: created.id }),
      ).resolves.toMatchObject({ accessType: 'member', role: EmployerRole.RECRUITER });
      await expect(
        authService.assertEmployerAccess(memberPrincipal, {
          employerAccountId: created.id,
          requireOwner: true,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });

      await expect(
        authService.assertEmployerAccess(ownerPrincipal, {
          employerAccountId: created.id,
          requireOwner: true,
        }),
      ).resolves.toMatchObject({ accessType: 'owner', role: EmployerRole.OWNER });

      // 3. Profile update modifies only IndividualEmployerProfile
      const updated = await repo.updateIndividualProfile({
        employerAccountId: created.id,
        publicName: 'Bikila Updated',
        city: null,
      });
      expect(updated?.profile).toMatchObject({
        publicName: 'Bikila Updated',
        contactPhone: '+251911223344',
        countryCode: 'ET',
        city: null,
      });

      // 4. Multiple individual accounts per user are allowed
      const secondAccount = await repo.createIndividualAccount({
        ownerUserId: owner.id,
        publicName: 'Second Individual Practice',
        contactPhone: null,
        countryCode: null,
        city: null,
      });
      expect(secondAccount.id).not.toBe(created.id);

      // 5. Organization accounts are never returned/updated by individual account repository methods
      const orgAccount = await prisma.employerAccount.create({
        data: {
          ownerUserId: owner.id,
          type: EmployerType.ORGANIZATION,
          status: EmployerStatus.ACTIVE,
        },
      });
      expect(await repo.findIndividualAccountById(orgAccount.id)).toBeNull();
      expect(
        await repo.updateIndividualProfile({
          employerAccountId: orgAccount.id,
          publicName: 'Nope',
        }),
      ).toBeNull();

      // 6. Atomicity rollback check: invalid countryCode (> Char(2)) fails IndividualEmployerProfile insert
      // and rolls back EmployerAccount insert inside the same transaction -> zero orphan accounts!
      const countBeforeRollback = await prisma.employerAccount.count({
        where: { ownerUserId: owner.id },
      });
      await expect(
        repo.createIndividualAccount({
          ownerUserId: owner.id,
          publicName: 'Should Rollback',
          contactPhone: null,
          countryCode: 'INVALID_TOO_LONG_FOR_CHAR_2',
          city: null,
        }),
      ).rejects.toThrow();

      const countAfterRollback = await prisma.employerAccount.count({
        where: { ownerUserId: owner.id },
      });
      expect(countAfterRollback).toBe(countBeforeRollback);
    } finally {
      await prisma.employerAccount.deleteMany({
        where: { ownerUser: { email: { in: [ownerEmail, memberEmail] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, memberEmail] } },
      });
    }
  });
});
