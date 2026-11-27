import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../app.js';
import {
  EmployerRole,
  EmployerStatus,
  EmployerType,
  MembershipStatus,
  UserStatus,
  VerificationStatus,
} from '../../generated/prisma/enums.js';
import type {
  EmployerAccessRepository,
  EmployerAccountAccessRecord,
} from '../authorization/ports/employer-access.repository.js';
import type { PermissionRepository } from '../authorization/ports/permission.repository.js';
import { JoseAccessTokenService } from '../identity/domain/access-token.js';
import { CryptoRefreshTokenService } from '../identity/domain/refresh-token.js';
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
} from '../identity/ports/session.repository.js';
import type { UserRecord } from '../identity/ports/user.repository.js';
import type {
  CreateIndividualEmployerAccountInput,
  EmployerAccountRepository,
  IndividualEmployerAccountRecord,
  UpdateIndividualEmployerProfileInput,
} from './ports/employer-account.repository.js';

interface StoredAccount {
  id: string;
  ownerUserId: string;
  type: EmployerType;
  status: EmployerStatus;
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
  profile: {
    publicName: string;
    contactPhone: string | null;
    countryCode: string | null;
    city: string | null;
    updatedAt: Date;
  } | null;
  memberships: Map<string, { id: string; role: EmployerRole; status: MembershipStatus }>;
}

describe('Employer Accounts Routes (/api/v1/employer-accounts)', () => {
  const jwtSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const ownerId = '550e8400-e29b-41d4-a716-446655440101';
  const memberId = '550e8400-e29b-41d4-a716-446655440102';
  const invitedId = '550e8400-e29b-41d4-a716-446655440103';
  const suspendedMemberId = '550e8400-e29b-41d4-a716-446655440104';
  const outsiderId = '550e8400-e29b-41d4-a716-446655440105';
  const unverifiedUserId = '550e8400-e29b-41d4-a716-446655440106';

  let nowMs: number;
  let users: UserRecord[];
  let sessions: UserSessionRecord[];
  let accounts: Map<string, StoredAccount>;
  let forceRepoFailure: boolean;
  let accessTokenService: JoseAccessTokenService;
  let refreshTokenService: CryptoRefreshTokenService;
  let app: ReturnType<typeof createApp>;

  async function issueTokenFor(userId: string, overrides?: Partial<UserSessionRecord>) {
    const sid = overrides?.id ?? randomUUID();
    const refresh = refreshTokenService.generateToken();
    sessions.push({
      id: sid,
      userId,
      tokenFamilyId: randomUUID(),
      refreshTokenHash: refreshTokenService.hashToken(refresh),
      parentSessionId: null,
      expiresAt: overrides?.expiresAt ?? new Date(nowMs + 86_400_000),
      revokedAt: overrides?.revokedAt ?? null,
      createdAt: new Date(nowMs),
    });
    const { token } = await accessTokenService.sign({ userId, sessionId: sid });
    return { token, refreshCookie: `jmp_refresh=${refresh}`, sessionId: sid };
  }

  beforeEach(() => {
    nowMs = new Date('2026-11-27T14:00:00Z').getTime();
    const clock = () => new Date(nowMs);
    forceRepoFailure = false;

    users = [ownerId, memberId, invitedId, suspendedMemberId, outsiderId].map((id, i) => ({
      id,
      displayName: `User ${i}`,
      email: `u${i}@example.com`,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(nowMs - 10_000),
      createdAt: new Date(nowMs),
      updatedAt: new Date(nowMs),
    }));
    users.push({
      id: unverifiedUserId,
      displayName: 'Unverified User',
      email: 'unverified@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(nowMs),
      updatedAt: new Date(nowMs),
    });

    sessions = [];
    accounts = new Map();

    accessTokenService = new JoseAccessTokenService({
      secret: jwtSecret,
      ttlSeconds: 900,
      clock,
    });
    refreshTokenService = new CryptoRefreshTokenService();

    const sessionRepository: SessionRepository = {
      async create(input: CreateSessionInput): Promise<UserSessionRecord> {
        const rec: UserSessionRecord = {
          id: randomUUID(),
          ...input,
          revokedAt: null,
          createdAt: new Date(nowMs),
        };
        sessions.push(rec);
        return rec;
      },
      async createAuthenticatedSession(
        input: CreateAuthenticatedSessionInput,
      ): Promise<CreateAuthenticatedSessionResult> {
        return { outcome: 'created', session: await this.create(input) };
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
      async revokeFamilyByTokenHash(): Promise<RevokeFamilyResult> {
        return { revokedCount: 0, tokenFamilyId: null };
      },
    };

    const permissionRepository: PermissionRepository = {
      async hasUserPermission(): Promise<boolean> {
        return false;
      },
      async listUserPermissionCodes(): Promise<string[]> {
        return [];
      },
    };

    const employerAccessRepository: EmployerAccessRepository = {
      async findAccountAccessForUser(
        employerAccountId: string,
        userId: string,
      ): Promise<EmployerAccountAccessRecord | null> {
        const acc = accounts.get(employerAccountId);
        if (!acc) return null;
        return {
          employerAccountId: acc.id,
          ownerUserId: acc.ownerUserId,
          accountStatus: acc.status,
          accountType: acc.type,
          membership: acc.memberships.get(userId) ?? null,
        };
      },
    };

    const employerAccountRepository: EmployerAccountRepository = {
      async createIndividualAccount(
        input: CreateIndividualEmployerAccountInput,
      ): Promise<IndividualEmployerAccountRecord> {
        if (forceRepoFailure) {
          throw new Error('relation "employer_accounts" SQL error');
        }
        const id = randomUUID();
        const now = clock();
        const stored: StoredAccount = {
          id,
          ownerUserId: input.ownerUserId,
          type: EmployerType.INDIVIDUAL,
          status: EmployerStatus.ACTIVE,
          verificationStatus: VerificationStatus.UNVERIFIED,
          createdAt: now,
          updatedAt: now,
          profile: {
            publicName: input.publicName,
            contactPhone: input.contactPhone,
            countryCode: input.countryCode,
            city: input.city,
            updatedAt: now,
          },
          memberships: new Map(),
        };
        accounts.set(id, stored);
        return {
          id: stored.id,
          ownerUserId: stored.ownerUserId,
          type: EmployerType.INDIVIDUAL,
          status: stored.status,
          verificationStatus: stored.verificationStatus,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
          profile: { ...stored.profile! },
        };
      },

      async findIndividualAccountById(
        employerAccountId: string,
      ): Promise<IndividualEmployerAccountRecord | null> {
        const stored = accounts.get(employerAccountId);
        if (!stored || stored.type !== EmployerType.INDIVIDUAL || !stored.profile) {
          return null;
        }
        return {
          id: stored.id,
          ownerUserId: stored.ownerUserId,
          type: EmployerType.INDIVIDUAL,
          status: stored.status,
          verificationStatus: stored.verificationStatus,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
          profile: { ...stored.profile },
        };
      },

      async updateIndividualProfile(
        input: UpdateIndividualEmployerProfileInput,
      ): Promise<IndividualEmployerAccountRecord | null> {
        const stored = accounts.get(input.employerAccountId);
        if (!stored || stored.type !== EmployerType.INDIVIDUAL || !stored.profile) {
          return null;
        }
        const updatedAt = new Date(clock().getTime() + 1000);
        stored.profile = {
          publicName: input.publicName ?? stored.profile.publicName,
          contactPhone:
            input.contactPhone !== undefined ? input.contactPhone : stored.profile.contactPhone,
          countryCode:
            input.countryCode !== undefined ? input.countryCode : stored.profile.countryCode,
          city: input.city !== undefined ? input.city : stored.profile.city,
          updatedAt,
        };
        return {
          id: stored.id,
          ownerUserId: stored.ownerUserId,
          type: EmployerType.INDIVIDUAL,
          status: stored.status,
          verificationStatus: stored.verificationStatus,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
          profile: { ...stored.profile },
        };
      },
    };

    app = createApp({
      identity: {
        sessionRepository,
        accessTokenService,
        refreshTokenService,
        clock,
      },
      authorization: {
        permissionRepository,
        employerAccessRepository,
      },
      employerAccounts: {
        employerAccountRepository,
      },
    });
  });

  it('rejects unauthenticated, cookie-only, revoked, expired, and unverified requests with 401', async () => {
    const revoked = await issueTokenFor(ownerId, { revokedAt: new Date(nowMs - 1000) });
    const expired = await issueTokenFor(ownerId, { expiresAt: new Date(nowMs - 1000) });
    const unverified = await issueTokenFor(unverifiedUserId);

    const payload = { publicName: 'Solo Studio' };

    await request(app).post('/api/v1/employer-accounts').send(payload).expect(401);
    await request(app)
      .post('/api/v1/employer-accounts')
      .set('Cookie', revoked.refreshCookie)
      .send(payload)
      .expect(401);
    await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', 'Bearer malformed.jwt')
      .send(payload)
      .expect(401);
    await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', `Bearer ${revoked.token}`)
      .send(payload)
      .expect(401);
    await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', `Bearer ${expired.token}`)
      .send(payload)
      .expect(401);
    await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', `Bearer ${unverified.token}`)
      .send(payload)
      .expect(401);
  });

  it('creates an INDIVIDUAL/ACTIVE/UNVERIFIED employer account derived from req.auth.userId and validates strict DTO', async () => {
    const owner = await issueTokenFor(ownerId);

    // Rejects unknown/forged fields and invalid values with 422 Problem Details
    const forgedRes = await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ publicName: 'Studio One', ownerUserId: outsiderId })
      .expect(422);
    expect(forgedRes.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(forgedRes.body.code).toBe('VALIDATION_ERROR');

    // Creates account + profile cleanly
    const createRes = await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        publicName: '  Abebe Hiring  ',
        contactPhone: '  +251 911 000000 ',
        countryCode: ' et ',
        city: '  Addis Ababa ',
      })
      .expect(201);

    const accountId = createRes.body.data.id as string;
    expect(createRes.headers['location']).toBe(`/api/v1/employer-accounts/${accountId}`);
    expect(createRes.body).toEqual({
      data: {
        id: accountId,
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
        verificationStatus: 'UNVERIFIED',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        profile: {
          publicName: 'Abebe Hiring',
          contactPhone: '+251 911 000000',
          countryCode: 'ET',
          city: 'Addis Ababa',
          updatedAt: expect.any(String),
        },
      },
    });
    expect(JSON.stringify(createRes.body)).not.toContain(ownerId);

    const stored = accounts.get(accountId)!;
    expect(stored.ownerUserId).toBe(ownerId);
    expect(stored.memberships.size).toBe(0);

    // Repository errors return safe 500 without leaking DB error details
    forceRepoFailure = true;
    const errorRes = await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ publicName: 'Another Account' })
      .expect(500);
    expect(errorRes.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(errorRes.body)).not.toContain('SQL error');
  });

  it('enforces tenant ownership, active-member read vs owner-only PATCH, non-leaking 404s, and excludes ORGANIZATION accounts', async () => {
    const owner = await issueTokenFor(ownerId);
    const activeMember = await issueTokenFor(memberId);
    const invitedMember = await issueTokenFor(invitedId);
    const suspendedMember = await issueTokenFor(suspendedMemberId);
    const outsider = await issueTokenFor(outsiderId);

    const createRes = await request(app)
      .post('/api/v1/employer-accounts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ publicName: 'Owner Studio', countryCode: 'ET' })
      .expect(201);
    const accountId = createRes.body.data.id as string;

    // Seed an active member, an invited member, and a suspended member
    const stored = accounts.get(accountId)!;
    stored.memberships.set(memberId, {
      id: 'm-active',
      role: EmployerRole.RECRUITER,
      status: MembershipStatus.ACTIVE,
    });
    stored.memberships.set(invitedId, {
      id: 'm-invited',
      role: EmployerRole.ADMIN,
      status: MembershipStatus.INVITED,
    });
    stored.memberships.set(suspendedMemberId, {
      id: 'm-suspended',
      role: EmployerRole.ADMIN,
      status: MembershipStatus.SUSPENDED,
    });

    // Owner GET & PATCH succeed
    await request(app)
      .get(`/api/v1/employer-accounts/${accountId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const patchRes = await request(app)
      .patch(`/api/v1/employer-accounts/${accountId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ city: 'Adama', contactPhone: null })
      .expect(200);
    expect(patchRes.body.data.profile).toMatchObject({
      publicName: 'Owner Studio',
      contactPhone: null,
      countryCode: 'ET',
      city: 'Adama',
    });

    // Empty PATCH and immutable fields rejected with 422
    await request(app)
      .patch(`/api/v1/employer-accounts/${accountId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({})
      .expect(422);
    await request(app)
      .patch(`/api/v1/employer-accounts/${accountId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ publicName: 'Attempt', verificationStatus: 'VERIFIED' })
      .expect(422);

    // Active member can GET, cannot PATCH (403)
    await request(app)
      .get(`/api/v1/employer-accounts/${accountId}`)
      .set('Authorization', `Bearer ${activeMember.token}`)
      .expect(200);
    await request(app)
      .patch(`/api/v1/employer-accounts/${accountId}`)
      .set('Authorization', `Bearer ${activeMember.token}`)
      .send({ publicName: 'Hijacked Name' })
      .expect(403);

    // Outsider, invited, suspended, missing ID, and malformed ID all get non-leaking 404
    for (const badReq of [
      request(app)
        .get(`/api/v1/employer-accounts/${accountId}`)
        .set('Authorization', `Bearer ${outsider.token}`),
      request(app)
        .get(`/api/v1/employer-accounts/${accountId}`)
        .set('Authorization', `Bearer ${invitedMember.token}`),
      request(app)
        .get(`/api/v1/employer-accounts/${accountId}`)
        .set('Authorization', `Bearer ${suspendedMember.token}`),
      request(app)
        .patch(`/api/v1/employer-accounts/${accountId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ publicName: 'Outsider', ownerUserId: ownerId }),
      request(app)
        .get(`/api/v1/employer-accounts/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.token}`),
      request(app)
        .get('/api/v1/employer-accounts/not-a-uuid')
        .set('Authorization', `Bearer ${owner.token}`),
    ]) {
      const r = await badReq.expect(404);
      expect(r.body.code).toBe('EMPLOYER_ACCOUNT_NOT_FOUND');
    }

    // Organization account (even for owner or active non-owner member) returns non-leaking 404 on GET and PATCH
    const orgId = randomUUID();
    accounts.set(orgId, {
      id: orgId,
      ownerUserId: ownerId,
      type: EmployerType.ORGANIZATION,
      status: EmployerStatus.ACTIVE,
      verificationStatus: VerificationStatus.UNVERIFIED,
      createdAt: new Date(nowMs),
      updatedAt: new Date(nowMs),
      profile: null,
      memberships: new Map([
        [
          memberId,
          { id: 'm-org-admin', role: EmployerRole.ADMIN, status: MembershipStatus.ACTIVE },
        ],
      ]),
    });

    await request(app)
      .get(`/api/v1/employer-accounts/${orgId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await request(app)
      .patch(`/api/v1/employer-accounts/${orgId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ publicName: 'Should Fail' })
      .expect(404);

    const orgMemberGetRes = await request(app)
      .get(`/api/v1/employer-accounts/${orgId}`)
      .set('Authorization', `Bearer ${activeMember.token}`)
      .expect(404);
    expect(orgMemberGetRes.body.code).toBe('EMPLOYER_ACCOUNT_NOT_FOUND');

    const orgMemberPatchRes = await request(app)
      .patch(`/api/v1/employer-accounts/${orgId}`)
      .set('Authorization', `Bearer ${activeMember.token}`)
      .send({ publicName: 'Should Also Return 404' })
      .expect(404);
    expect(orgMemberPatchRes.body.code).toBe('EMPLOYER_ACCOUNT_NOT_FOUND');
  });
});
