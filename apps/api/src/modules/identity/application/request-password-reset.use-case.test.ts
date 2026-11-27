import { describe, it, expect, vi } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { logger } from '../../../observability/logger.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import type {
  EmailSender,
  PasswordResetEmailPayload,
  VerificationEmailPayload,
} from '../ports/email-sender.js';
import type {
  ConsumePasswordResetTokenOutcome,
  IssuePasswordResetTokenInput,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from '../ports/password-reset-token.repository.js';
import type {
  CreateUserInput,
  UserCredentialRecord,
  UserRecord,
  UserRepository,
} from '../ports/user.repository.js';
import {
  GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
  RequestPasswordResetUseCase,
} from './request-password-reset.use-case.js';

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

class InMemoryPasswordResetRepo implements PasswordResetTokenRepository {
  public tokens: PasswordResetTokenRecord[] = [];
  private seq = 1;

  async issueToken(input: IssuePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    for (const token of this.tokens) {
      if (token.userId === input.userId && token.usedAt === null) {
        token.usedAt = input.now;
      }
    }
    const created: PasswordResetTokenRecord = {
      id: `prt-${this.seq++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.now,
    };
    this.tokens.push(created);
    return created;
  }

  async consumeAndResetPassword(): Promise<ConsumePasswordResetTokenOutcome> {
    return 'invalid_or_expired';
  }
}

class FakeEmailSender implements EmailSender {
  public sentReset: PasswordResetEmailPayload[] = [];
  public shouldFail = false;

  async sendVerificationEmail(_payload: VerificationEmailPayload): Promise<void> {}

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    if (this.shouldFail) {
      throw new Error(`SMTP error for ${payload.resetUrl}`);
    }
    this.sentReset.push(payload);
  }
}

describe('RequestPasswordResetUseCase', () => {
  const now = new Date('2026-11-27T10:00:00Z');

  function buildUseCase() {
    const userRepo = new InMemoryUserRepo();
    const tokenRepo = new InMemoryPasswordResetRepo();
    const tokenService = new CryptoVerificationTokenService();
    const emailSender = new FakeEmailSender();
    const useCase = new RequestPasswordResetUseCase({
      userRepository: userRepo,
      tokenRepository: tokenRepo,
      tokenService,
      emailSender,
      appWebUrl: 'https://jobs.example.com/',
      tokenTtlMinutes: 30,
      clock: () => now,
    });
    return { userRepo, tokenRepo, tokenService, emailSender, useCase };
  }

  it('returns identical generic accepted response for unknown, unverified, inactive, and active verified users', async () => {
    const { userRepo, tokenRepo, emailSender, useCase } = buildUseCase();

    userRepo.users.push(
      {
        id: 'u-unverified',
        displayName: 'Unverified',
        email: 'unverified@example.com',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u-suspended',
        displayName: 'Suspended',
        email: 'suspended@example.com',
        status: UserStatus.SUSPENDED,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u-active',
        displayName: 'Active User',
        email: 'active@example.com',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    );

    const unknownRes = await useCase.execute({ email: 'nobody@example.com' });
    const unverifiedRes = await useCase.execute({ email: 'unverified@example.com' });
    const suspendedRes = await useCase.execute({ email: 'suspended@example.com' });

    expect(tokenRepo.tokens).toHaveLength(0);
    expect(emailSender.sentReset).toHaveLength(0);

    const activeRes = await useCase.execute({ email: '  ACTIVE@Example.COM  ' });

    const expected = {
      accepted: true,
      message: GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
    };
    expect(unknownRes).toEqual(expected);
    expect(unverifiedRes).toEqual(expected);
    expect(suspendedRes).toEqual(expected);
    expect(activeRes).toEqual(expected);

    expect(tokenRepo.tokens).toHaveLength(1);
    expect(emailSender.sentReset).toHaveLength(1);
    expect(emailSender.sentReset[0]!.to).toBe('active@example.com');
    expect(emailSender.sentReset[0]!.expiresInMinutes).toBe(30);
    const parsedUrl = new URL(emailSender.sentReset[0]!.resetUrl);
    expect(parsedUrl.origin).toBe('https://jobs.example.com');
    expect(parsedUrl.pathname).toBe('/reset-password');
    expect(parsedUrl.searchParams.get('token')).toBeTruthy();
    expect(tokenRepo.tokens[0]!.tokenHash).not.toBe(parsedUrl.searchParams.get('token'));
  });

  it('sanitizes email provider failures and still returns generic accepted response', async () => {
    const { userRepo, emailSender, useCase } = buildUseCase();
    userRepo.users.push({
      id: 'u-active',
      displayName: 'Active User',
      email: 'active@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    emailSender.shouldFail = true;

    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const result = await useCase.execute({ email: 'active@example.com' });

    expect(result).toEqual({
      accepted: true,
      message: GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
    });
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('[REDACTED_RESET_URL]');
    expect(logged).not.toContain('reset-password?token=');

    errorSpy.mockRestore();
  });
});
