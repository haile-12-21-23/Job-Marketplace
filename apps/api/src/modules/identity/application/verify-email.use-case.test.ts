import { describe, it, expect, vi } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import { VerifyEmailUseCase } from './verify-email.use-case.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import type {
  ConsumeVerificationTokenOutcome,
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
  IssueVerificationTokenInput,
} from '../ports/email-verification-token.repository.js';
import type { UserRecord } from '../ports/user.repository.js';

class InMemoryVerificationTokenRepository implements EmailVerificationTokenRepository {
  public tokens: EmailVerificationTokenRecord[] = [];
  public users: Map<string, UserRecord> = new Map();
  public verificationUpdatesCount = 0;
  private idSeq = 1;

  async issueToken(input: IssueVerificationTokenInput): Promise<EmailVerificationTokenRecord> {
    for (const token of this.tokens) {
      if (token.userId === input.userId && token.usedAt === null) {
        token.usedAt = input.now;
      }
    }
    const record: EmailVerificationTokenRecord = {
      id: `tok-${this.idSeq++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.now,
    };
    this.tokens.push(record);
    return record;
  }

  async consumeAndVerifyUser(
    tokenHash: string,
    now: Date,
  ): Promise<ConsumeVerificationTokenOutcome> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    if (!token || token.usedAt !== null || token.expiresAt.getTime() <= now.getTime()) {
      return 'invalid_or_expired';
    }

    const user = this.users.get(token.userId);
    if (!user || user.emailVerifiedAt !== null) {
      return 'invalid_or_expired';
    }

    token.usedAt = now;
    user.emailVerifiedAt = now;
    this.verificationUpdatesCount += 1;
    return 'verified';
  }
}

describe('VerifyEmailUseCase', () => {
  it('verifies an unverified user with a valid token and sets emailVerifiedAt once', async () => {
    const now = new Date('2026-11-26T10:00:00Z');
    const tokenRepo = new InMemoryVerificationTokenRepository();
    const tokenService = new CryptoVerificationTokenService();
    const user: UserRecord = {
      id: 'user-1',
      displayName: 'Abebe',
      email: 'abebe@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    tokenRepo.users.set(user.id, user);

    const rawToken = tokenService.generateToken();
    const tokenHash = tokenService.hashToken(rawToken);
    await tokenRepo.issueToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date('2026-11-26T11:00:00Z'),
      now,
    });

    // Stored record contains hash only, never raw token
    expect(tokenRepo.tokens[0]?.tokenHash).toBe(tokenHash);
    expect(tokenRepo.tokens[0]?.tokenHash).not.toBe(rawToken);

    const useCase = new VerifyEmailUseCase(tokenRepo, tokenService, () => now);
    const result = await useCase.execute({ token: rawToken });

    expect(result).toEqual({
      verified: true,
      message: 'Your email address has been verified.',
    });
    expect(user.emailVerifiedAt).toEqual(now);
    expect(tokenRepo.tokens[0]?.usedAt).toEqual(now);
    expect(tokenRepo.verificationUpdatesCount).toBe(1);
  });

  it('rejects unknown, expired, reused, and superseded tokens', async () => {
    let currentTime = new Date('2026-11-26T10:00:00Z');
    const tokenRepo = new InMemoryVerificationTokenRepository();
    const tokenService = new CryptoVerificationTokenService();
    const user: UserRecord = {
      id: 'user-1',
      displayName: 'Abebe',
      email: 'abebe@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: currentTime,
      updatedAt: currentTime,
    };
    tokenRepo.users.set(user.id, user);

    const useCase = new VerifyEmailUseCase(tokenRepo, tokenService, () => currentTime);

    // 1. Unknown token
    await expect(useCase.execute({ token: 'unknown-token' })).rejects.toThrowError(AppError);

    // 2. Superseded token
    const firstRaw = tokenService.generateToken();
    const secondRaw = tokenService.generateToken();
    await tokenRepo.issueToken({
      userId: user.id,
      tokenHash: tokenService.hashToken(firstRaw),
      expiresAt: new Date('2026-11-26T11:00:00Z'),
      now: currentTime,
    });
    await tokenRepo.issueToken({
      userId: user.id,
      tokenHash: tokenService.hashToken(secondRaw),
      expiresAt: new Date('2026-11-26T11:00:00Z'),
      now: currentTime,
    });

    await expect(useCase.execute({ token: firstRaw })).rejects.toThrowError(AppError);

    // 3. Expired token
    currentTime = new Date('2026-11-26T11:00:01Z');
    await expect(useCase.execute({ token: secondRaw })).rejects.toThrowError(AppError);
    expect(user.emailVerifiedAt).toBeNull();

    // 4. Reused token after valid verification
    const thirdRaw = tokenService.generateToken();
    currentTime = new Date('2026-11-26T11:05:00Z');
    await tokenRepo.issueToken({
      userId: user.id,
      tokenHash: tokenService.hashToken(thirdRaw),
      expiresAt: new Date('2026-11-26T12:00:00Z'),
      now: currentTime,
    });

    await useCase.execute({ token: thirdRaw });
    expect(user.emailVerifiedAt).toEqual(currentTime);

    await expect(useCase.execute({ token: thirdRaw })).rejects.toThrowError(AppError);
    expect(tokenRepo.verificationUpdatesCount).toBe(1);
  });

  it('prevents concurrent consumption of the same token from succeeding twice', async () => {
    const now = new Date('2026-11-26T10:00:00Z');
    const tokenRepo = new InMemoryVerificationTokenRepository();
    const tokenService = new CryptoVerificationTokenService();
    const user: UserRecord = {
      id: 'user-1',
      displayName: 'Abebe',
      email: 'abebe@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    tokenRepo.users.set(user.id, user);

    const rawToken = tokenService.generateToken();
    await tokenRepo.issueToken({
      userId: user.id,
      tokenHash: tokenService.hashToken(rawToken),
      expiresAt: new Date('2026-11-26T11:00:00Z'),
      now,
    });

    const useCase = new VerifyEmailUseCase(tokenRepo, tokenService, () => now);
    const consumeSpy = vi.spyOn(tokenRepo, 'consumeAndVerifyUser');

    const results = await Promise.allSettled([
      useCase.execute({ token: rawToken }),
      useCase.execute({ token: rawToken }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(consumeSpy).toHaveBeenCalledTimes(2);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(tokenRepo.verificationUpdatesCount).toBe(1);
  });
});
