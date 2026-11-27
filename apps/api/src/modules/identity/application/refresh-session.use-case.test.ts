import { describe, it, expect, beforeEach } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import { JoseAccessTokenService } from '../domain/access-token.js';
import { CryptoRefreshTokenService } from '../domain/refresh-token.js';
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
} from '../ports/session.repository.js';
import { RefreshSessionUseCase } from './refresh-session.use-case.js';

class InMemorySessionRepository implements SessionRepository {
  public sessions: UserSessionRecord[] = [];
  public userStatus: UserStatus = UserStatus.ACTIVE;
  public emailVerifiedAt: Date | null = new Date('2026-11-26T08:00:00Z');
  public forceRotateOutcome: RotateSessionResult | null = null;
  public rotateCalls = 0;

  async create(input: CreateSessionInput): Promise<UserSessionRecord> {
    const record: UserSessionRecord = {
      id: 'sess-root-1',
      userId: input.userId,
      tokenFamilyId: input.tokenFamilyId,
      refreshTokenHash: input.refreshTokenHash,
      parentSessionId: input.parentSessionId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date('2026-11-26T09:00:00Z'),
    };
    this.sessions.push(record);
    return record;
  }

  async createAuthenticatedSession(
    input: CreateAuthenticatedSessionInput,
  ): Promise<CreateAuthenticatedSessionResult> {
    const session = await this.create(input);
    return { outcome: 'created', session };
  }

  async findRotationCandidateByTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionRotationCandidate | null> {
    const session = this.sessions.find((s) => s.refreshTokenHash === refreshTokenHash);
    if (!session) return null;
    return {
      session: { ...session },
      user: {
        id: session.userId,
        displayName: 'Abebe Bikila',
        email: 'abebe@example.com',
        status: this.userStatus,
        emailVerifiedAt: this.emailVerifiedAt,
      },
    };
  }

  async rotateSession(input: RotateSessionInput): Promise<RotateSessionResult> {
    this.rotateCalls++;
    if (this.forceRotateOutcome) {
      return this.forceRotateOutcome;
    }

    const session = this.sessions.find((s) => s.refreshTokenHash === input.presentedTokenHash);
    if (!session) return { outcome: 'not_found' };
    if (session.revokedAt !== null) {
      const hasChild = this.sessions.some((s) => s.parentSessionId === session.id);
      if (hasChild) {
        for (const s of this.sessions) {
          if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
            s.revokedAt = input.now;
          }
        }
        return { outcome: 'replayed', tokenFamilyId: session.tokenFamilyId };
      }
      return { outcome: 'revoked' };
    }
    if (session.expiresAt.getTime() <= input.now.getTime()) {
      return { outcome: 'expired' };
    }
    if (this.userStatus !== UserStatus.ACTIVE || this.emailVerifiedAt === null) {
      return { outcome: 'user_ineligible' };
    }

    session.revokedAt = input.now;
    const child: UserSessionRecord = {
      id: input.newSessionId,
      userId: session.userId,
      tokenFamilyId: session.tokenFamilyId,
      refreshTokenHash: input.newRefreshTokenHash,
      parentSessionId: session.id,
      expiresAt: session.expiresAt,
      revokedAt: null,
      createdAt: input.now,
    };
    this.sessions.push(child);

    return {
      outcome: 'rotated',
      session: child,
      user: {
        id: session.userId,
        displayName: 'Abebe Bikila',
        email: 'abebe@example.com',
      },
    };
  }

  async revokeFamilyIfReplayed(refreshTokenHash: string, now: Date): Promise<ReplayCheckResult> {
    const session = this.sessions.find((s) => s.refreshTokenHash === refreshTokenHash);
    if (!session) return { outcome: 'not_found' };
    const hasChild = this.sessions.some((s) => s.parentSessionId === session.id);
    if (hasChild) {
      for (const s of this.sessions) {
        if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
          s.revokedAt = now;
        }
      }
      return { outcome: 'replayed', tokenFamilyId: session.tokenFamilyId };
    }
    return { outcome: 'revoked' };
  }

  async revokeFamilyByTokenHash(refreshTokenHash: string, now: Date): Promise<RevokeFamilyResult> {
    const session = this.sessions.find((s) => s.refreshTokenHash === refreshTokenHash);
    if (!session) return { revokedCount: 0, tokenFamilyId: null };
    let count = 0;
    for (const s of this.sessions) {
      if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
        s.revokedAt = now;
        count++;
      }
    }
    return { revokedCount: count, tokenFamilyId: session.tokenFamilyId };
  }
}

describe('RefreshSessionUseCase', () => {
  const jwtSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  let nowMs: number;
  let sessionRepo: InMemorySessionRepository;
  let refreshTokenService: CryptoRefreshTokenService;
  let accessTokenService: JoseAccessTokenService;
  let useCase: RefreshSessionUseCase;
  let rootRawToken: string;

  beforeEach(async () => {
    nowMs = new Date('2026-11-26T10:00:00Z').getTime();
    sessionRepo = new InMemorySessionRepository();
    refreshTokenService = new CryptoRefreshTokenService();
    accessTokenService = new JoseAccessTokenService({
      secret: jwtSecret,
      ttlSeconds: 900,
      issuer: 'job-marketplace-api',
      audience: 'job-marketplace-web',
      clock: () => new Date(nowMs),
    });
    useCase = new RefreshSessionUseCase({
      sessionRepository: sessionRepo,
      accessTokenService,
      refreshTokenService,
      clock: () => new Date(nowMs),
    });

    rootRawToken = refreshTokenService.generateToken();
    await sessionRepo.create({
      userId,
      tokenFamilyId: 'fam-1',
      refreshTokenHash: refreshTokenService.hashToken(rootRawToken),
      parentSessionId: null,
      expiresAt: new Date(nowMs + 30 * 86_400_000),
    });
  });

  it('rotates valid refresh token, preserves fixed family expiry, and binds new JWT sid to child session', async () => {
    nowMs += 60_000;
    const result = await useCase.execute(rootRawToken);

    expect(result.refreshToken).not.toBe(rootRawToken);
    expect(JSON.stringify(result.response)).not.toContain(result.refreshToken);
    expect(JSON.stringify(result.response)).not.toContain(rootRawToken);
    expect(result.response.tokenType).toBe('Bearer');
    expect(result.response.expiresIn).toBe(900);
    expect(result.response.user).toEqual({
      id: userId,
      displayName: 'Abebe Bikila',
      email: 'abebe@example.com',
    });

    expect(sessionRepo.sessions).toHaveLength(2);
    const parent = sessionRepo.sessions[0]!;
    const child = sessionRepo.sessions[1]!;
    expect(parent.revokedAt?.getTime()).toBe(nowMs);
    expect(child.parentSessionId).toBe(parent.id);
    expect(child.tokenFamilyId).toBe('fam-1');
    expect(child.expiresAt.getTime()).toBe(parent.expiresAt.getTime());
    expect(child.refreshTokenHash).toBe(refreshTokenService.hashToken(result.refreshToken));

    const claims = await accessTokenService.verify(result.response.accessToken);
    expect(claims.sub).toBe(userId);
    expect(claims.sid).toBe(child.id);
  });

  it('rejects missing or unknown refresh tokens with generic 401', async () => {
    for (const raw of [null, undefined, '', 'unknown-token-value']) {
      await expect(useCase.execute(raw)).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired session.',
      });
    }
  });

  it('rejects expired, revoked, and user-ineligible sessions without minting tokens', async () => {
    // Expired
    nowMs = sessionRepo.sessions[0]!.expiresAt.getTime();
    await expect(useCase.execute(rootRawToken)).rejects.toBeInstanceOf(AppError);
    expect(sessionRepo.rotateCalls).toBe(0);

    // Suspended user
    nowMs = new Date('2026-11-26T11:00:00Z').getTime();
    sessionRepo.userStatus = UserStatus.SUSPENDED;
    await expect(useCase.execute(rootRawToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(sessionRepo.rotateCalls).toBe(0);

    // Unverified user
    sessionRepo.userStatus = UserStatus.ACTIVE;
    sessionRepo.emailVerifiedAt = null;
    await expect(useCase.execute(rootRawToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(sessionRepo.rotateCalls).toBe(0);
  });

  it('detects reuse of a consumed parent token and revokes only that token family', async () => {
    // Unrelated family for same user
    sessionRepo.sessions.push({
      id: 'sess-other-family',
      userId,
      tokenFamilyId: 'fam-other',
      refreshTokenHash: refreshTokenService.hashToken(refreshTokenService.generateToken()),
      parentSessionId: null,
      expiresAt: new Date(nowMs + 30 * 86_400_000),
      revokedAt: null,
      createdAt: new Date(nowMs),
    });

    const rotated = await useCase.execute(rootRawToken);

    // Replay consumed root token
    nowMs += 5000;
    await expect(useCase.execute(rootRawToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });

    // Child in fam-1 must now be revoked; fam-other must stay active
    const fam1Child = sessionRepo.sessions.find((s) => s.parentSessionId === 'sess-root-1')!;
    const otherFam = sessionRepo.sessions.find((s) => s.tokenFamilyId === 'fam-other')!;
    expect(fam1Child.revokedAt).not.toBeNull();
    expect(otherFam.revokedAt).toBeNull();

    // Child token can no longer refresh
    await expect(useCase.execute(rotated.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('does not consume or rotate the active session if access-token signing fails', async () => {
    const failingAccessTokenService = {
      async sign() {
        throw new Error('KMS signing failure');
      },
      async verify() {
        throw new Error('unused');
      },
    };
    const failingUseCase = new RefreshSessionUseCase({
      sessionRepository: sessionRepo,
      accessTokenService: failingAccessTokenService,
      refreshTokenService,
      clock: () => new Date(nowMs),
    });

    await expect(failingUseCase.execute(rootRawToken)).rejects.toThrow('KMS signing failure');
    expect(sessionRepo.rotateCalls).toBe(0);
    expect(sessionRepo.sessions[0]!.revokedAt).toBeNull();
  });

  it('discards pre-signed JWT and throws 401 if atomic rotation reports replay', async () => {
    sessionRepo.forceRotateOutcome = { outcome: 'replayed', tokenFamilyId: 'fam-1' };

    await expect(useCase.execute(rootRawToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(sessionRepo.rotateCalls).toBe(1);
  });
});
