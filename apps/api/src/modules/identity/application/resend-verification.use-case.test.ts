import { describe, it, expect, vi } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { logger } from '../../../observability/logger.js';
import { ResendVerificationUseCase } from './resend-verification.use-case.js';
import { VerificationEmailIssuer } from './verification-email-issuer.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import type { EmailSender, VerificationEmailPayload } from '../ports/email-sender.js';
import type {
  ConsumeVerificationTokenOutcome,
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
  IssueVerificationTokenInput,
} from '../ports/email-verification-token.repository.js';
import type {
  CreateUserInput,
  UserCredentialRecord,
  UserRecord,
  UserRepository,
} from '../ports/user.repository.js';

class InMemoryUserRepo implements UserRepository {
  public users: UserRecord[] = [];
  async findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    return this.users.find((u) => u.email === normalizedEmail) ?? null;
  }
  async findCredentialsByEmail(): Promise<UserCredentialRecord | null> {
    return null;
  }
  async create(data: CreateUserInput): Promise<UserRecord> {
    const record: UserRecord = {
      id: 'user-1',
      displayName: data.displayName,
      email: data.email,
      status: data.status ?? UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(record);
    return record;
  }
}

class InMemoryTokenRepo implements EmailVerificationTokenRepository {
  public tokens: EmailVerificationTokenRecord[] = [];
  private seq = 1;
  async issueToken(input: IssueVerificationTokenInput): Promise<EmailVerificationTokenRecord> {
    for (const token of this.tokens) {
      if (token.userId === input.userId && token.usedAt === null) {
        token.usedAt = input.now;
      }
    }
    const created: EmailVerificationTokenRecord = {
      id: `tok-${this.seq++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.now,
    };
    this.tokens.push(created);
    return created;
  }
  async consumeAndVerifyUser(): Promise<ConsumeVerificationTokenOutcome> {
    return 'invalid_or_expired';
  }
}

class FakeEmailSender implements EmailSender {
  public sent: VerificationEmailPayload[] = [];
  public shouldFail = false;
  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    if (this.shouldFail) {
      throw new Error(`SMTP failure for ${payload.verificationUrl}`);
    }
    this.sent.push(payload);
  }
}

describe('ResendVerificationUseCase', () => {
  it('issues a new token, supersedes active tokens, and sends email for unverified accounts', async () => {
    const now = new Date('2026-11-26T10:00:00Z');
    const userRepo = new InMemoryUserRepo();
    const tokenRepo = new InMemoryTokenRepo();
    const emailSender = new FakeEmailSender();
    const tokenService = new CryptoVerificationTokenService();

    userRepo.users.push({
      id: 'user-1',
      displayName: 'Unverified User',
      email: 'unverified@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await tokenRepo.issueToken({
      userId: 'user-1',
      tokenHash: 'old-hash',
      expiresAt: new Date('2026-11-26T11:00:00Z'),
      now,
    });

    const issuer = new VerificationEmailIssuer({
      tokenRepository: tokenRepo,
      tokenService,
      emailSender,
      appWebUrl: 'https://jobs.example.com',
      tokenTtlMinutes: 60,
      clock: () => now,
    });
    const useCase = new ResendVerificationUseCase(userRepo, issuer);

    const res = await useCase.execute({ email: '  UNVERIFIED@Example.COM  ' });
    expect(res).toEqual({
      accepted: true,
      message:
        'If an unverified account exists for that email address, a verification email has been sent.',
    });

    expect(tokenRepo.tokens).toHaveLength(2);
    expect(tokenRepo.tokens[0]?.usedAt).toEqual(now);
    expect(tokenRepo.tokens[1]?.usedAt).toBeNull();
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe('unverified@example.com');
    expect(emailSender.sent[0]?.verificationUrl).toContain(
      'https://jobs.example.com/verify-email?token=',
    );
  });

  it('returns identical generic response and sends no email for verified or unknown accounts', async () => {
    const now = new Date('2026-11-26T10:00:00Z');
    const userRepo = new InMemoryUserRepo();
    const tokenRepo = new InMemoryTokenRepo();
    const emailSender = new FakeEmailSender();
    const tokenService = new CryptoVerificationTokenService();

    userRepo.users.push({
      id: 'user-verified',
      displayName: 'Verified User',
      email: 'verified@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const issuer = new VerificationEmailIssuer({
      tokenRepository: tokenRepo,
      tokenService,
      emailSender,
      appWebUrl: 'https://jobs.example.com',
      tokenTtlMinutes: 60,
      clock: () => now,
    });
    const useCase = new ResendVerificationUseCase(userRepo, issuer);

    const verifiedResponse = await useCase.execute({ email: 'verified@example.com' });
    const unknownResponse = await useCase.execute({ email: 'missing@example.com' });

    expect(verifiedResponse).toEqual(unknownResponse);
    expect(tokenRepo.tokens).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('handles email provider failures safely without exposing raw tokens or URLs in logs or responses', async () => {
    const now = new Date('2026-11-26T10:00:00Z');
    const userRepo = new InMemoryUserRepo();
    const tokenRepo = new InMemoryTokenRepo();
    const emailSender = new FakeEmailSender();
    emailSender.shouldFail = true;
    const tokenService = new CryptoVerificationTokenService();

    const fixedRawToken = 'secret-raw-token-for-test';
    vi.spyOn(tokenService, 'generateToken').mockReturnValue(fixedRawToken);
    const errorLogSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    userRepo.users.push({
      id: 'user-1',
      displayName: 'Unverified User',
      email: 'unverified@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const issuer = new VerificationEmailIssuer({
      tokenRepository: tokenRepo,
      tokenService,
      emailSender,
      appWebUrl: 'https://jobs.example.com',
      tokenTtlMinutes: 60,
      clock: () => now,
    });
    const useCase = new ResendVerificationUseCase(userRepo, issuer);

    const res = await useCase.execute({ email: 'unverified@example.com' });
    expect(res).toEqual({
      accepted: true,
      message:
        'If an unverified account exists for that email address, a verification email has been sent.',
    });

    expect(errorLogSpy).toHaveBeenCalledTimes(1);
    const logPayload = JSON.stringify(errorLogSpy.mock.calls);
    expect(logPayload).not.toContain(fixedRawToken);
    expect(logPayload).not.toContain(`token=${fixedRawToken}`);

    errorLogSpy.mockRestore();
  });
});
