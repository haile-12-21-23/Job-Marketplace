import { describe, it, expect, vi } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import { LoginUseCase } from './login.use-case.js';
import { JoseAccessTokenService } from '../domain/access-token.js';
import { CryptoRefreshTokenService } from '../domain/refresh-token.js';
import type { PasswordHasher } from '../domain/password-hasher.js';
import type {
  CreateUserInput,
  UserCredentialRecord,
  UserRecord,
  UserRepository,
} from '../ports/user.repository.js';
import type {
  CreateSessionInput,
  SessionRepository,
  UserSessionRecord,
} from '../ports/session.repository.js';

class InMemoryUserRepo implements UserRepository {
  public users: Array<UserRecord & { passwordHash: string }> = [];

  async findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    const found = this.users.find((u) => u.email === normalizedEmail);
    if (!found) return null;
    const { passwordHash: _ignored, ...safe } = found;
    return safe;
  }

  async findCredentialsByEmail(normalizedEmail: string): Promise<UserCredentialRecord | null> {
    const found = this.users.find((u) => u.email === normalizedEmail);
    if (!found) return null;
    return {
      id: found.id,
      displayName: found.displayName,
      email: found.email,
      passwordHash: found.passwordHash,
      status: found.status,
      emailVerifiedAt: found.emailVerifiedAt,
    };
  }

  async create(data: CreateUserInput): Promise<UserRecord> {
    const record = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: data.displayName,
      email: data.email,
      passwordHash: data.passwordHash,
      status: data.status ?? UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(record);
    return record;
  }
}

class InMemorySessionRepo implements SessionRepository {
  public sessions: UserSessionRecord[] = [];
  public shouldFail = false;

  async create(input: CreateSessionInput): Promise<UserSessionRecord> {
    if (this.shouldFail) {
      throw new Error('Database write failed');
    }
    const created: UserSessionRecord = {
      id: '7ba7b810-9dad-11d1-80b4-00c04fd430c8',
      userId: input.userId,
      tokenFamilyId: input.tokenFamilyId,
      refreshTokenHash: input.refreshTokenHash,
      parentSessionId: input.parentSessionId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date('2026-11-26T12:00:00Z'),
    };
    this.sessions.push(created);
    return created;
  }
}

class FakePasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return `hashed_${plaintext}`;
  }
  async compare(plaintext: string, hash: string): Promise<boolean> {
    return hash === `hashed_${plaintext}`;
  }
}

describe('LoginUseCase', () => {
  const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  function buildUseCase(now: Date) {
    const userRepo = new InMemoryUserRepo();
    const sessionRepo = new InMemorySessionRepo();
    const hasher = new FakePasswordHasher();
    const accessTokenService = new JoseAccessTokenService({
      secret,
      ttlSeconds: 900,
      issuer: 'job-marketplace-api',
      audience: 'job-marketplace-web',
      clock: () => now,
    });
    const refreshTokenService = new CryptoRefreshTokenService();

    const useCase = new LoginUseCase({
      userRepository: userRepo,
      sessionRepository: sessionRepo,
      passwordHasher: hasher,
      accessTokenService,
      refreshTokenService,
      refreshTokenTtlDays: 30,
      clock: () => now,
    });

    return { userRepo, sessionRepo, hasher, accessTokenService, refreshTokenService, useCase };
  }

  it('logs in an active verified user, persists hashed session, and signs access token', async () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const { userRepo, sessionRepo, accessTokenService, refreshTokenService, useCase } =
      buildUseCase(now);

    userRepo.users.push({
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Abebe Bikila',
      email: 'abebe@example.com',
      passwordHash: 'hashed_CorrectPassword123!',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-11-26T11:00:00Z'),
      createdAt: now,
      updatedAt: now,
    });

    const result = await useCase.execute({
      email: '  ABEBE@Example.COM  ',
      password: 'CorrectPassword123!',
    });

    expect(result.response).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        displayName: 'Abebe Bikila',
        email: 'abebe@example.com',
      },
    });
    expect((result.response as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect((result.response as Record<string, unknown>)['refreshToken']).toBeUndefined();

    // Persisted session checks
    expect(sessionRepo.sessions).toHaveLength(1);
    const session = sessionRepo.sessions[0]!;
    expect(session.userId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(session.parentSessionId).toBeNull();
    expect(session.revokedAt).toBeNull();
    expect(session.refreshTokenHash).toBe(refreshTokenService.hashToken(result.refreshToken));
    expect(session.refreshTokenHash).not.toBe(result.refreshToken);
    expect(session.expiresAt).toEqual(new Date(now.getTime() + 30 * 86_400_000));

    // Access token claims check
    const claims = await accessTokenService.verify(result.response.accessToken);
    expect(claims.sub).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(claims.sid).toBe(session.id);
  });

  it('returns indistinguishable 401 INVALID_CREDENTIALS for unknown user, wrong password, unverified, and non-active accounts', async () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const { userRepo, sessionRepo, hasher, useCase } = buildUseCase(now);
    const compareSpy = vi.spyOn(hasher, 'compare');

    userRepo.users.push(
      {
        id: 'u-unverified',
        displayName: 'Unverified',
        email: 'unverified@example.com',
        passwordHash: 'hashed_Password123!',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u-inactive',
        displayName: 'Inactive',
        email: 'inactive@example.com',
        passwordHash: 'hashed_Password123!',
        status: UserStatus.INACTIVE,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u-suspended',
        displayName: 'Suspended',
        email: 'suspended@example.com',
        passwordHash: 'hashed_Password123!',
        status: UserStatus.SUSPENDED,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u-deleted',
        displayName: 'Deleted',
        email: 'deleted@example.com',
        passwordHash: 'hashed_Password123!',
        status: UserStatus.DELETED,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u-active',
        displayName: 'Active',
        email: 'active@example.com',
        passwordHash: 'hashed_Password123!',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    );

    const failureAttempts = [
      { email: 'unknown@example.com', password: 'Password123!' },
      { email: 'active@example.com', password: 'WrongPassword!' },
      { email: 'unverified@example.com', password: 'Password123!' },
      { email: 'inactive@example.com', password: 'Password123!' },
      { email: 'suspended@example.com', password: 'Password123!' },
      { email: 'deleted@example.com', password: 'Password123!' },
    ];

    for (const attempt of failureAttempts) {
      try {
        await useCase.execute(attempt);
        expect.unreachable('Expected login failure');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('INVALID_CREDENTIALS');
        expect(appErr.message).toBe('Invalid email or password.');
      }
    }

    // Unknown user still triggered dummy hash compare; no sessions persisted
    expect(compareSpy).toHaveBeenCalledTimes(failureAttempts.length);
    expect(sessionRepo.sessions).toHaveLength(0);
  });

  it('does not issue tokens when session persistence fails', async () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const { userRepo, sessionRepo, accessTokenService, useCase } = buildUseCase(now);
    sessionRepo.shouldFail = true;
    const signSpy = vi.spyOn(accessTokenService, 'sign');

    userRepo.users.push({
      id: 'u-active',
      displayName: 'Active',
      email: 'active@example.com',
      passwordHash: 'hashed_Password123!',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      useCase.execute({ email: 'active@example.com', password: 'Password123!' }),
    ).rejects.toThrowError('Database write failed');

    expect(signSpy).not.toHaveBeenCalled();
  });
});
