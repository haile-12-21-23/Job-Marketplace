import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../../../errors/app-error.js';
import {
  EmployerRole,
  EmployerStatus,
  EmployerType,
  MembershipStatus,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { JoseAccessTokenService } from '../../identity/domain/access-token.js';
import type {
  PrincipalSessionLookup,
  SessionRotationCandidate,
} from '../../identity/ports/session.repository.js';
import { PLATFORM_PERMISSIONS } from '../authorization.catalogue.js';
import { AuthorizationService } from './authorization.service.js';
import type {
  EmployerAccessRepository,
  EmployerAccountAccessRecord,
} from '../ports/employer-access.repository.js';
import type { PermissionRepository } from '../ports/permission.repository.js';

describe('AuthorizationService', () => {
  const jwtSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const otherUserId = '550e8400-e29b-41d4-a716-446655440002';
  const sessionId = '6ba7b810-9dad-11d1-80b4-00c04fd43001';
  const employerAccountId = '7ba7b810-9dad-11d1-80b4-00c04fd43001';

  function createFixture(nowMs = new Date('2026-11-27T12:00:00Z').getTime()) {
    let currentMs = nowMs;
    const clock = () => new Date(currentMs);
    const accessTokenService = new JoseAccessTokenService({
      secret: jwtSecret,
      ttlSeconds: 900,
      issuer: 'job-marketplace-api',
      audience: 'job-marketplace-web',
      clock,
    });

    let candidate: SessionRotationCandidate | null = {
      session: {
        id: sessionId,
        userId,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: 'hash',
        parentSessionId: null,
        expiresAt: new Date(currentMs + 86_400_000),
        revokedAt: null,
        createdAt: new Date(currentMs),
      },
      user: {
        id: userId,
        displayName: 'Test User',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(currentMs - 1000),
      },
    };

    const userGrants = new Map<string, Set<string>>();
    const accountAccessByKey = new Map<string, EmployerAccountAccessRecord>();

    const sessionRepository: PrincipalSessionLookup = {
      async findSessionCandidateByIdAndUserId(sid, uid) {
        if (!candidate) return null;
        if (candidate.session.id !== sid || candidate.session.userId !== uid) return null;
        return candidate;
      },
    };

    const permissionRepository: PermissionRepository = {
      async hasUserPermission(uid, code) {
        return userGrants.get(uid)?.has(code) ?? false;
      },
      async listUserPermissionCodes(uid) {
        return Array.from(userGrants.get(uid) ?? []).sort();
      },
    };

    const employerAccessRepository: EmployerAccessRepository = {
      async findAccountAccessForUser(accId, uid) {
        return accountAccessByKey.get(`${accId}:${uid}`) ?? null;
      },
    };

    const service = new AuthorizationService({
      accessTokenService,
      sessionRepository,
      permissionRepository,
      employerAccessRepository,
      clock,
    });

    return {
      accessTokenService,
      sessionRepository,
      permissionRepository,
      employerAccessRepository,
      service,
      userGrants,
      accountAccessByKey,
      setCandidate: (next: SessionRotationCandidate | null) => {
        candidate = next;
      },
      advanceMs: (delta: number) => {
        currentMs += delta;
      },
      getNow: clock,
    };
  }

  describe('authenticateBearerHeader', () => {
    it('authenticates a valid Bearer token backed by a live session and active verified user', async () => {
      const fx = createFixture();
      const { token } = await fx.accessTokenService.sign({ userId, sessionId });

      const principal = await fx.service.authenticateBearerHeader(`Bearer ${token}`);
      expect(principal).toEqual({ userId, sessionId });
    });

    it('rejects missing, wrong-scheme, malformed, tampered, expired, or wrong-issuer/audience tokens with generic 401', async () => {
      const fx = createFixture();
      const { token } = await fx.accessTokenService.sign({ userId, sessionId });

      const wrongIssuer = new JoseAccessTokenService({
        secret: jwtSecret,
        ttlSeconds: 900,
        issuer: 'wrong-issuer',
        audience: 'job-marketplace-web',
        clock: fx.getNow,
      });
      const wrongAud = new JoseAccessTokenService({
        secret: jwtSecret,
        ttlSeconds: 900,
        issuer: 'job-marketplace-api',
        audience: 'wrong-audience',
        clock: fx.getNow,
      });
      const wrongSecret = new JoseAccessTokenService({
        secret: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        ttlSeconds: 900,
        issuer: 'job-marketplace-api',
        audience: 'job-marketplace-web',
        clock: fx.getNow,
      });

      const badHeaders: Array<string | string[] | undefined> = [
        undefined,
        '',
        '   ',
        ['Bearer abc'],
        `Basic ${token}`,
        'Bearer',
        `Bearer ${token} extra`,
        'Bearer not-a-jwt',
        `Bearer ${(await wrongIssuer.sign({ userId, sessionId })).token}`,
        `Bearer ${(await wrongAud.sign({ userId, sessionId })).token}`,
        `Bearer ${(await wrongSecret.sign({ userId, sessionId })).token}`,
      ];

      for (const header of badHeaders) {
        await expect(fx.service.authenticateBearerHeader(header)).rejects.toMatchObject({
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required to access this resource.',
        });
      }

      // Expired JWT -> 401
      fx.advanceMs(901_000);
      await expect(fx.service.authenticateBearerHeader(`Bearer ${token}`)).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });
    });

    it('rejects non-UUID sub/sid, missing session, revoked/expired sessions, and ineligible users with 401', async () => {
      const fx = createFixture();
      const nonUuidToken = (await fx.accessTokenService.sign({ userId: 'not-a-uuid', sessionId }))
        .token;
      await expect(
        fx.service.authenticateBearerHeader(`Bearer ${nonUuidToken}`),
      ).rejects.toMatchObject({ statusCode: 401, code: 'AUTHENTICATION_REQUIRED' });

      const { token } = await fx.accessTokenService.sign({ userId, sessionId });

      // Missing session
      fx.setCandidate(null);
      await expect(fx.service.authenticateBearerHeader(`Bearer ${token}`)).rejects.toMatchObject({
        statusCode: 401,
      });

      // Revoked session
      fx.setCandidate({
        session: {
          id: sessionId,
          userId,
          tokenFamilyId: randomUUID(),
          refreshTokenHash: 'h',
          parentSessionId: null,
          expiresAt: new Date(fx.getNow().getTime() + 60_000),
          revokedAt: new Date(fx.getNow().getTime() - 1000),
          createdAt: fx.getNow(),
        },
        user: {
          id: userId,
          displayName: 'User',
          email: 'u@example.com',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: fx.getNow(),
        },
      });
      await expect(fx.service.authenticateBearerHeader(`Bearer ${token}`)).rejects.toMatchObject({
        statusCode: 401,
      });

      // Expired persisted session
      fx.setCandidate({
        session: {
          id: sessionId,
          userId,
          tokenFamilyId: randomUUID(),
          refreshTokenHash: 'h',
          parentSessionId: null,
          expiresAt: fx.getNow(),
          revokedAt: null,
          createdAt: fx.getNow(),
        },
        user: {
          id: userId,
          displayName: 'User',
          email: 'u@example.com',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: fx.getNow(),
        },
      });
      await expect(fx.service.authenticateBearerHeader(`Bearer ${token}`)).rejects.toMatchObject({
        statusCode: 401,
      });

      // Suspended / Deleted / Unverified user
      for (const status of [UserStatus.SUSPENDED, UserStatus.INACTIVE, UserStatus.DELETED]) {
        fx.setCandidate({
          session: {
            id: sessionId,
            userId,
            tokenFamilyId: randomUUID(),
            refreshTokenHash: 'h',
            parentSessionId: null,
            expiresAt: new Date(fx.getNow().getTime() + 60_000),
            revokedAt: null,
            createdAt: fx.getNow(),
          },
          user: {
            id: userId,
            displayName: 'User',
            email: 'u@example.com',
            status,
            emailVerifiedAt: fx.getNow(),
          },
        });
        await expect(fx.service.authenticateBearerHeader(`Bearer ${token}`)).rejects.toMatchObject({
          statusCode: 401,
        });
      }

      fx.setCandidate({
        session: {
          id: sessionId,
          userId,
          tokenFamilyId: randomUUID(),
          refreshTokenHash: 'h',
          parentSessionId: null,
          expiresAt: new Date(fx.getNow().getTime() + 60_000),
          revokedAt: null,
          createdAt: fx.getNow(),
        },
        user: {
          id: userId,
          displayName: 'User',
          email: 'u@example.com',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: null,
        },
      });
      await expect(fx.service.authenticateBearerHeader(`Bearer ${token}`)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('lets session repository database failures bubble instead of masking as 401', async () => {
      const fx = createFixture();
      const { token } = await fx.accessTokenService.sign({ userId, sessionId });
      vi.spyOn(fx.sessionRepository, 'findSessionCandidateByIdAndUserId').mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      await expect(fx.service.authenticateBearerHeader(`Bearer ${token}`)).rejects.toThrowError(
        'Connection refused',
      );
    });
  });

  describe('assertPermission', () => {
    it('enforces 401 without principal, 403 when missing grant, and dynamically respects grant changes', async () => {
      const fx = createFixture();
      await expect(
        fx.service.assertPermission(undefined, PLATFORM_PERMISSIONS.JOBS_MODERATE),
      ).rejects.toMatchObject({ statusCode: 401, code: 'AUTHENTICATION_REQUIRED' });

      const principal = { userId, sessionId };
      await expect(
        fx.service.assertPermission(principal, PLATFORM_PERMISSIONS.JOBS_MODERATE),
      ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_PERMISSIONS' });

      fx.userGrants.set(userId, new Set([PLATFORM_PERMISSIONS.JOBS_MODERATE]));
      await expect(
        fx.service.assertPermission(principal, PLATFORM_PERMISSIONS.JOBS_MODERATE),
      ).resolves.toBeUndefined();
      await expect(
        fx.service.assertPermission(principal, PLATFORM_PERMISSIONS.REPORTS_MANAGE),
      ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_PERMISSIONS' });

      // Revoking persisted grant immediately denies subsequent call
      fx.userGrants.get(userId)!.delete(PLATFORM_PERMISSIONS.JOBS_MODERATE);
      await expect(
        fx.service.assertPermission(principal, PLATFORM_PERMISSIONS.JOBS_MODERATE),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('propagates repository failures instead of converting them into 403', async () => {
      const fx = createFixture();
      vi.spyOn(fx.permissionRepository, 'hasUserPermission').mockRejectedValueOnce(
        new Error('DB query timeout'),
      );

      await expect(
        fx.service.assertPermission({ userId, sessionId }, PLATFORM_PERMISSIONS.JOBS_MODERATE),
      ).rejects.toThrowError('DB query timeout');
    });
  });

  describe('assertEmployerAccess', () => {
    it('allows persisted owner on active account, allows permitted active member roles, and denies all unauthorized cases', async () => {
      const fx = createFixture();
      const ownerPrincipal = { userId, sessionId };
      const memberPrincipal = { userId: otherUserId, sessionId };

      await expect(
        fx.service.assertEmployerAccess(undefined, { employerAccountId }),
      ).rejects.toMatchObject({ statusCode: 401 });

      // Missing account -> 404
      await expect(
        fx.service.assertEmployerAccess(ownerPrincipal, { employerAccountId }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'EMPLOYER_ACCOUNT_NOT_FOUND' });

      // Suspended account -> 404 even for owner
      fx.accountAccessByKey.set(`${employerAccountId}:${userId}`, {
        employerAccountId,
        ownerUserId: userId,
        accountStatus: EmployerStatus.SUSPENDED,
        accountType: EmployerType.ORGANIZATION,
        membership: null,
      });
      await expect(
        fx.service.assertEmployerAccess(ownerPrincipal, { employerAccountId }),
      ).rejects.toMatchObject({ statusCode: 404 });

      // Active owner -> allowed
      fx.accountAccessByKey.set(`${employerAccountId}:${userId}`, {
        employerAccountId,
        ownerUserId: userId,
        accountStatus: EmployerStatus.ACTIVE,
        accountType: EmployerType.ORGANIZATION,
        membership: null,
      });
      await expect(
        fx.service.assertEmployerAccess(ownerPrincipal, {
          employerAccountId,
          requireOwner: true,
        }),
      ).resolves.toMatchObject({
        employerAccountId,
        accessType: 'owner',
        role: EmployerRole.OWNER,
      });

      // Invited / suspended / non-member -> 404
      fx.accountAccessByKey.set(`${employerAccountId}:${otherUserId}`, {
        employerAccountId,
        ownerUserId: userId,
        accountStatus: EmployerStatus.ACTIVE,
        accountType: EmployerType.ORGANIZATION,
        membership: {
          id: 'm-1',
          role: EmployerRole.ADMIN,
          status: MembershipStatus.INVITED,
        },
      });
      await expect(
        fx.service.assertEmployerAccess(memberPrincipal, { employerAccountId }),
      ).rejects.toMatchObject({ statusCode: 404 });

      fx.accountAccessByKey.set(`${employerAccountId}:${otherUserId}`, {
        employerAccountId,
        ownerUserId: userId,
        accountStatus: EmployerStatus.ACTIVE,
        accountType: EmployerType.ORGANIZATION,
        membership: {
          id: 'm-1',
          role: EmployerRole.ADMIN,
          status: MembershipStatus.SUSPENDED,
        },
      });
      await expect(
        fx.service.assertEmployerAccess(memberPrincipal, { employerAccountId }),
      ).rejects.toMatchObject({ statusCode: 404 });

      // Active RECRUITER member: allowed for RECRUITER, 403 for ADMIN-only or requireOwner
      fx.accountAccessByKey.set(`${employerAccountId}:${otherUserId}`, {
        employerAccountId,
        ownerUserId: userId,
        accountStatus: EmployerStatus.ACTIVE,
        accountType: EmployerType.ORGANIZATION,
        membership: {
          id: 'm-1',
          role: EmployerRole.RECRUITER,
          status: MembershipStatus.ACTIVE,
        },
      });
      await expect(
        fx.service.assertEmployerAccess(memberPrincipal, {
          employerAccountId,
          allowedMembershipRoles: [EmployerRole.ADMIN, EmployerRole.RECRUITER],
        }),
      ).resolves.toMatchObject({
        accessType: 'member',
        role: EmployerRole.RECRUITER,
      });

      await expect(
        fx.service.assertEmployerAccess(memberPrincipal, {
          employerAccountId,
          allowedMembershipRoles: [EmployerRole.OWNER, EmployerRole.ADMIN],
        }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_PERMISSIONS' });

      await expect(
        fx.service.assertEmployerAccess(memberPrincipal, {
          employerAccountId,
          requireOwner: true,
        }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_PERMISSIONS' });
    });
  });
});
