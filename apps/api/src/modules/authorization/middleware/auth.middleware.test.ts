import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import {
  EmployerRole,
  EmployerStatus,
  EmployerType,
  MembershipStatus,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { JoseAccessTokenService } from '../../identity/domain/access-token.js';
import { BcryptPasswordHasher } from '../../identity/domain/password-hasher.js';
import { CryptoRefreshTokenService } from '../../identity/domain/refresh-token.js';
import type {
  CreateAuthenticatedSessionInput,
  CreateAuthenticatedSessionResult,
  CreateSessionInput,
  ReplayCheckResult,
  RevokeFamilyResult,
  RotateSessionInput,
  RotateSessionResult,
  SessionRepository,
  SessionRotationCandidate,
  UserSessionRecord,
} from '../../identity/ports/session.repository.js';
import type {
  CreateUserInput,
  UserCredentialRecord,
  UserRecord,
  UserRepository,
} from '../../identity/ports/user.repository.js';
import { PLATFORM_PERMISSIONS } from '../authorization.catalogue.js';
import type {
  EmployerAccessRepository,
  EmployerAccountAccessRecord,
} from '../ports/employer-access.repository.js';
import type { PermissionRepository } from '../ports/permission.repository.js';

interface TestEmployerAccount {
  id: string;
  ownerUserId: string;
  status: EmployerStatus;
  type: EmployerType;
  memberships: Map<string, { id: string; role: EmployerRole; status: MembershipStatus }>;
}

describe('Authorization Middleware & Route Integration', () => {
  const jwtSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const ownerUserId = '550e8400-e29b-41d4-a716-446655440010';
  const adminMemberUserId = '550e8400-e29b-41d4-a716-446655440011';
  const invitedUserId = '550e8400-e29b-41d4-a716-446655440012';
  const outsiderUserId = '550e8400-e29b-41d4-a716-446655440013';
  const platformAdminUserId = '550e8400-e29b-41d4-a716-446655440014';

  const activeAccountId = '8ba7b810-9dad-11d1-80b4-00c04fd43010';
  const otherAccountId = '8ba7b810-9dad-11d1-80b4-00c04fd43011';
  const suspendedAccountId = '8ba7b810-9dad-11d1-80b4-00c04fd43012';

  let nowMs: number;
  let users: UserRecord[];
  let sessions: UserSessionRecord[];
  let grants: Map<string, Set<string>>;
  let employerAccounts: Map<string, TestEmployerAccount>;
  let forcePermissionError: boolean;
  let hasher: BcryptPasswordHasher;
  let accessTokenService: JoseAccessTokenService;
  let refreshTokenService: CryptoRefreshTokenService;
  let app: ReturnType<typeof createApp>;

  async function issueSessionAndBearer(userId: string) {
    const sid = randomUUID();
    const rawRefresh = refreshTokenService.generateToken();
    sessions.push({
      id: sid,
      userId,
      tokenFamilyId: randomUUID(),
      refreshTokenHash: refreshTokenService.hashToken(rawRefresh),
      parentSessionId: null,
      expiresAt: new Date(nowMs + 30 * 86_400_000),
      revokedAt: null,
      createdAt: new Date(nowMs),
    });
    const { token } = await accessTokenService.sign({ userId, sessionId: sid });
    return { token, sessionId: sid, refreshToken: rawRefresh };
  }

  beforeEach(async () => {
    nowMs = new Date('2026-11-27T12:00:00Z').getTime();
    const clock = () => new Date(nowMs);
    hasher = new BcryptPasswordHasher(4);
    const pwHash = await hasher.hash('SecurePass2026!');

    users = [
      ownerUserId,
      adminMemberUserId,
      invitedUserId,
      outsiderUserId,
      platformAdminUserId,
    ].map((id, idx) => ({
      id,
      displayName: `User ${idx}`,
      email: `user${idx}@example.com`,
      passwordHash: pwHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(nowMs - 10_000),
      createdAt: new Date(nowMs),
      updatedAt: new Date(nowMs),
    }));

    sessions = [];
    grants = new Map<string, Set<string>>([
      [
        platformAdminUserId,
        new Set([PLATFORM_PERMISSIONS.JOBS_MODERATE, PLATFORM_PERMISSIONS.PLATFORM_USERS_READ]),
      ],
    ]);
    forcePermissionError = false;

    employerAccounts = new Map<string, TestEmployerAccount>([
      [
        activeAccountId,
        {
          id: activeAccountId,
          ownerUserId,
          status: EmployerStatus.ACTIVE,
          type: EmployerType.ORGANIZATION,
          memberships: new Map([
            [
              adminMemberUserId,
              { id: 'm-1', role: EmployerRole.ADMIN, status: MembershipStatus.ACTIVE },
            ],
            [
              invitedUserId,
              { id: 'm-2', role: EmployerRole.RECRUITER, status: MembershipStatus.INVITED },
            ],
          ]),
        },
      ],
      [
        otherAccountId,
        {
          id: otherAccountId,
          ownerUserId: outsiderUserId,
          status: EmployerStatus.ACTIVE,
          type: EmployerType.INDIVIDUAL,
          memberships: new Map(),
        },
      ],
      [
        suspendedAccountId,
        {
          id: suspendedAccountId,
          ownerUserId,
          status: EmployerStatus.SUSPENDED,
          type: EmployerType.ORGANIZATION,
          memberships: new Map(),
        },
      ],
    ]);

    accessTokenService = new JoseAccessTokenService({
      secret: jwtSecret,
      ttlSeconds: 900,
      issuer: 'job-marketplace-api',
      audience: 'job-marketplace-web',
      clock,
    });
    refreshTokenService = new CryptoRefreshTokenService();

    const userRepository: UserRepository = {
      async findByEmail(email: string): Promise<UserRecord | null> {
        return users.find((u) => u.email === email) ?? null;
      },
      async findCredentialsByEmail(email: string): Promise<UserCredentialRecord | null> {
        const u = users.find((x) => x.email === email);
        if (!u || !u.passwordHash) return null;
        return {
          id: u.id,
          displayName: u.displayName,
          email: u.email,
          passwordHash: u.passwordHash,
          status: u.status,
          emailVerifiedAt: u.emailVerifiedAt,
        };
      },
      async create(input: CreateUserInput): Promise<UserRecord> {
        const rec: UserRecord = {
          id: randomUUID(),
          displayName: input.displayName,
          email: input.email,
          passwordHash: input.passwordHash,
          status: input.status ?? UserStatus.ACTIVE,
          emailVerifiedAt: null,
          createdAt: new Date(nowMs),
          updatedAt: new Date(nowMs),
        };
        users.push(rec);
        return rec;
      },
    };

    const sessionRepository: SessionRepository = {
      async create(input: CreateSessionInput): Promise<UserSessionRecord> {
        const rec: UserSessionRecord = {
          id: randomUUID(),
          userId: input.userId,
          tokenFamilyId: input.tokenFamilyId,
          refreshTokenHash: input.refreshTokenHash,
          parentSessionId: input.parentSessionId,
          expiresAt: input.expiresAt,
          revokedAt: null,
          createdAt: new Date(nowMs),
        };
        sessions.push(rec);
        return rec;
      },
      async createAuthenticatedSession(
        input: CreateAuthenticatedSessionInput,
      ): Promise<CreateAuthenticatedSessionResult> {
        const session = await this.create(input);
        return { outcome: 'created', session };
      },
      async findRotationCandidateByTokenHash(): Promise<SessionRotationCandidate | null> {
        return null;
      },
      async findSessionCandidateByIdAndUserId(
        sessionId: string,
        userId: string,
      ): Promise<SessionRotationCandidate | null> {
        const session = sessions.find((s) => s.id === sessionId && s.userId === userId);
        if (!session) return null;
        const user = users.find((u) => u.id === session.userId);
        if (!user) return null;
        return {
          session: { ...session },
          user: {
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            status: user.status,
            emailVerifiedAt: user.emailVerifiedAt,
          },
        };
      },
      async rotateSession(_input: RotateSessionInput): Promise<RotateSessionResult> {
        return { outcome: 'not_found' };
      },
      async revokeFamilyIfReplayed(): Promise<ReplayCheckResult> {
        return { outcome: 'not_found' };
      },
      async revokeFamilyByTokenHash(hash: string, now: Date): Promise<RevokeFamilyResult> {
        const session = sessions.find((s) => s.refreshTokenHash === hash);
        if (!session) return { revokedCount: 0, tokenFamilyId: null };
        let revokedCount = 0;
        for (const s of sessions) {
          if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
            s.revokedAt = now;
            revokedCount++;
          }
        }
        return { revokedCount, tokenFamilyId: session.tokenFamilyId };
      },
    };

    const permissionRepository: PermissionRepository = {
      async hasUserPermission(uid: string, code: string): Promise<boolean> {
        if (forcePermissionError) {
          throw new Error('PostgreSQL connection dropped');
        }
        return grants.get(uid)?.has(code) ?? false;
      },
      async listUserPermissionCodes(uid: string): Promise<string[]> {
        return Array.from(grants.get(uid) ?? []).sort();
      },
    };

    const employerAccessRepository: EmployerAccessRepository = {
      async findAccountAccessForUser(
        accId: string,
        uid: string,
      ): Promise<EmployerAccountAccessRecord | null> {
        const account = employerAccounts.get(accId);
        if (!account) return null;
        return {
          employerAccountId: account.id,
          ownerUserId: account.ownerUserId,
          accountStatus: account.status,
          accountType: account.type,
          membership: account.memberships.get(uid) ?? null,
        };
      },
    };

    app = createApp({
      corsOrigins: ['http://localhost:5173'],
      identity: {
        userRepository,
        passwordHasher: hasher,
        sessionRepository,
        accessTokenService,
        refreshTokenService,
        clock,
      },
      authorization: {
        permissionRepository,
        employerAccessRepository,
      },
      onMountV1Routes: (v1Router, { guards }) => {
        const testRouter = Router();

        testRouter.get('/me', guards.authenticate, (req, res) => {
          res.json({ data: req.auth });
        });

        testRouter.post(
          '/moderate',
          guards.authenticate,
          guards.requirePermission(PLATFORM_PERMISSIONS.JOBS_MODERATE),
          (req, res) => {
            res.json({ data: { moderatedBy: req.auth?.userId } });
          },
        );

        // Intentionally omit `authenticate` to verify unauthenticated permission check remains 401
        testRouter.get(
          '/unauthenticated-guard',
          guards.requirePermission(PLATFORM_PERMISSIONS.JOBS_MODERATE),
          (_req, res) => {
            res.json({ data: { ok: true } });
          },
        );

        testRouter.post(
          '/employers/:employerAccountId/manage',
          guards.authenticate,
          guards.requireEmployerAccess({
            allowedMembershipRoles: [EmployerRole.OWNER, EmployerRole.ADMIN],
          }),
          (req, res) => {
            res.json({ data: req.employerAccess });
          },
        );

        testRouter.post(
          '/employers/:employerAccountId/owner-only',
          guards.authenticate,
          guards.requireEmployerAccess({ requireOwner: true }),
          (req, res) => {
            res.json({ data: req.employerAccess });
          },
        );

        v1Router.use('/_test-auth', testRouter);
      },
    });
  });

  it('keeps public identity endpoints accessible and protects bearer endpoints against missing/cookie-only/revoked sessions', async () => {
    // Public endpoint works without bearer header
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'user0@example.com', password: 'SecurePass2026!' })
      .expect(200);

    const accessToken = loginRes.body.data.accessToken as string;
    const rawSetCookie = loginRes.headers['set-cookie'] as string | string[] | undefined;
    const setCookieHeader = Array.isArray(rawSetCookie) ? rawSetCookie[0]! : rawSetCookie!;
    const refreshCookie = setCookieHeader.split(';')[0]!;

    // No Authorization header -> 401 (even if refresh cookie is sent)
    await request(app).get('/api/v1/_test-auth/me').set('Cookie', refreshCookie).expect(401);

    // Valid bearer token -> 200 with minimal principal
    const meRes = await request(app)
      .get('/api/v1/_test-auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.data).toEqual({
      userId: ownerUserId,
      sessionId: expect.any(String),
    });

    // Logout revokes the live session -> same unexpired bearer JWT immediately returns 401
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', refreshCookie)
      .expect(200);

    const afterLogout = await request(app)
      .get('/api/v1/_test-auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(afterLogout.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('enforces persisted platform permissions dynamically and ignores forged client claims/headers', async () => {
    // Missing authenticate middleware stays 401, not 403
    await request(app).get('/api/v1/_test-auth/unauthenticated-guard').expect(401);

    const outsider = await issueSessionAndBearer(outsiderUserId);
    const admin = await issueSessionAndBearer(platformAdminUserId);

    // Non-admin sending forged RBAC fields in body/query/headers -> 403
    const forgedRes = await request(app)
      .post('/api/v1/_test-auth/moderate?role=SUPER_ADMIN&permissions=jobs.moderate')
      .set('Authorization', `Bearer ${outsider.token}`)
      .set('X-Role', 'SUPER_ADMIN')
      .set('X-User-Id', platformAdminUserId)
      .send({
        role: 'SUPER_ADMIN',
        permissions: [PLATFORM_PERMISSIONS.JOBS_MODERATE],
        userId: platformAdminUserId,
        grantedByUserId: platformAdminUserId,
      })
      .expect(403);

    expect(forgedRes.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    // Admin with persisted grant -> allowed
    await request(app)
      .post('/api/v1/_test-auth/moderate')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    // Grant revoked in DB -> same JWT is denied immediately on next request
    grants.get(platformAdminUserId)!.delete(PLATFORM_PERMISSIONS.JOBS_MODERATE);
    await request(app)
      .post('/api/v1/_test-auth/moderate')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(403);

    // Repository failure flows to central 500 error handler without leaking internals
    forcePermissionError = true;
    const errorRes = await request(app)
      .post('/api/v1/_test-auth/moderate')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(500);
    expect(errorRes.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(errorRes.body)).not.toContain('PostgreSQL connection dropped');
  });

  it('enforces server-side employer ownership/membership and denies spoofing, wrong tenants, suspended/invited members, and platform admins', async () => {
    const owner = await issueSessionAndBearer(ownerUserId);
    const adminMember = await issueSessionAndBearer(adminMemberUserId);
    const invitedMember = await issueSessionAndBearer(invitedUserId);
    const outsider = await issueSessionAndBearer(outsiderUserId);
    const platformAdmin = await issueSessionAndBearer(platformAdminUserId);

    // Owner allowed on active account (including owner-only)
    const ownerRes = await request(app)
      .post(`/api/v1/_test-auth/employers/${activeAccountId}/owner-only`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerRes.body.data).toMatchObject({
      employerAccountId: activeAccountId,
      accessType: 'owner',
      role: EmployerRole.OWNER,
    });

    // Active ADMIN allowed on manage, denied (403) on owner-only
    await request(app)
      .post(`/api/v1/_test-auth/employers/${activeAccountId}/manage`)
      .set('Authorization', `Bearer ${adminMember.token}`)
      .expect(200);
    await request(app)
      .post(`/api/v1/_test-auth/employers/${activeAccountId}/owner-only`)
      .set('Authorization', `Bearer ${adminMember.token}`)
      .expect(403);

    // Invited member, outsider (even spoofing ownerUserId/role/userId), wrong tenant, suspended account, and platform admin -> 404
    await request(app)
      .post(`/api/v1/_test-auth/employers/${activeAccountId}/manage`)
      .set('Authorization', `Bearer ${invitedMember.token}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/_test-auth/employers/${activeAccountId}/manage`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ ownerUserId, userId: ownerUserId, role: EmployerRole.OWNER })
      .expect(404);

    await request(app)
      .post(`/api/v1/_test-auth/employers/${otherAccountId}/manage`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/_test-auth/employers/${suspendedAccountId}/manage`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);

    // Platform role does NOT implicitly grant tenant access
    await request(app)
      .post(`/api/v1/_test-auth/employers/${activeAccountId}/manage`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(404);
  });
});
