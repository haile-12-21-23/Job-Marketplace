import { describe, it, expect, vi } from 'vitest';
import { OutboxStatus, UserStatus } from '../../../generated/prisma/enums.js';
import { OutboxPayloadCipher } from '../domain/outbox-payload-cipher.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import type { PasswordResetEmailPayload } from '../ports/email-sender.js';
import type { PasswordResetOutboxRecord } from '../ports/password-reset-outbox.repository.js';
import type {
  ConsumePasswordResetTokenOutcome,
  IssuePasswordResetTokenInput,
  IssuePasswordResetTokenWithOutboxInput,
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
  public outboxEvents: PasswordResetOutboxRecord[] = [];
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

  async issueTokenWithOutbox(
    input: IssuePasswordResetTokenWithOutboxInput,
  ): Promise<PasswordResetTokenRecord> {
    const token = await this.issueToken(input);
    this.outboxEvents.push({
      id: `obx-${this.seq++}`,
      eventType: input.outboxEvent.eventType,
      aggregateType: input.outboxEvent.aggregateType,
      aggregateId: input.outboxEvent.aggregateId,
      payload: input.outboxEvent.payload,
      status: OutboxStatus.PENDING,
      attempts: 0,
      availableAt: input.now,
      createdAt: input.now,
    });
    return token;
  }

  async hasEligibleToken(): Promise<boolean> {
    return false;
  }

  async consumeAndResetPassword(): Promise<ConsumePasswordResetTokenOutcome> {
    return 'invalid_or_expired';
  }
}

describe('RequestPasswordResetUseCase', () => {
  const now = new Date('2026-11-27T10:00:00Z');
  const cipher = new OutboxPayloadCipher('0123456789abcdef0123456789abcdef0123456789abcdef');

  function buildUseCase() {
    const userRepo = new InMemoryUserRepo();
    const tokenRepo = new InMemoryPasswordResetRepo();
    const tokenService = new CryptoVerificationTokenService();
    const notifyMock = vi.fn();
    const useCase = new RequestPasswordResetUseCase({
      userRepository: userRepo,
      tokenRepository: tokenRepo,
      tokenService,
      payloadCipher: cipher,
      outboxNotifier: { notify: notifyMock },
      appWebUrl: 'https://jobs.example.com/',
      tokenTtlMinutes: 30,
      clock: () => now,
    });
    return { userRepo, tokenRepo, tokenService, notifyMock, useCase };
  }

  it('returns identical generic accepted response for unknown, unverified, inactive, and active verified users and queues encrypted durable outbox work', async () => {
    const { userRepo, tokenRepo, tokenService, notifyMock, useCase } = buildUseCase();

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
    expect(tokenRepo.outboxEvents).toHaveLength(0);
    expect(notifyMock).not.toHaveBeenCalled();

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
    expect(tokenRepo.outboxEvents).toHaveLength(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);

    // Outbox payload must never contain plaintext token or reset URL
    const rawOutboxJson = JSON.stringify(tokenRepo.outboxEvents[0]!.payload);
    expect(rawOutboxJson).not.toContain('reset-password');
    expect(rawOutboxJson).not.toContain('active@example.com');

    const unsealed = cipher.unsealJson<PasswordResetEmailPayload>(
      tokenRepo.outboxEvents[0]!.payload,
    );
    expect(unsealed.to).toBe('active@example.com');
    expect(unsealed.expiresInMinutes).toBe(30);
    const parsedUrl = new URL(unsealed.resetUrl);
    expect(parsedUrl.origin).toBe('https://jobs.example.com');
    expect(parsedUrl.pathname).toBe('/reset-password');
    const rawToken = parsedUrl.searchParams.get('token')!;
    expect(rawToken.length).toBeGreaterThanOrEqual(40);
    expect(tokenRepo.tokens[0]!.tokenHash).toBe(tokenService.hashToken(rawToken));
  });
});
