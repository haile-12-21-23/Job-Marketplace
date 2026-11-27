import { describe, it, expect, vi } from 'vitest';
import { OutboxStatus, UserStatus } from '../../../generated/prisma/enums.js';
import { logger } from '../../../observability/logger.js';
import { OutboxPayloadCipher } from '../domain/outbox-payload-cipher.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import type {
  EmailSender,
  PasswordResetEmailPayload,
  VerificationEmailPayload,
} from '../ports/email-sender.js';
import type {
  MarkPasswordResetOutboxRetryInput,
  PasswordResetOutboxRecord,
  PasswordResetOutboxRepository,
} from '../ports/password-reset-outbox.repository.js';
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
import { PasswordResetOutboxDispatcher } from './password-reset-outbox-dispatcher.js';
import {
  GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
  RequestPasswordResetUseCase,
} from './request-password-reset.use-case.js';

class InMemoryOutboxStore implements PasswordResetOutboxRepository {
  public events: PasswordResetOutboxRecord[] = [];

  async claimPendingBatch(
    limit: number,
    now: Date,
    leaseMs: number,
  ): Promise<PasswordResetOutboxRecord[]> {
    const claimed: PasswordResetOutboxRecord[] = [];
    for (const event of this.events) {
      if (claimed.length >= limit) break;
      const duePending =
        event.status === OutboxStatus.PENDING && event.availableAt.getTime() <= now.getTime();
      const expiredLease =
        event.status === OutboxStatus.PROCESSING && event.availableAt.getTime() <= now.getTime();
      if (duePending || expiredLease) {
        event.status = OutboxStatus.PROCESSING;
        event.availableAt = new Date(now.getTime() + leaseMs);
        claimed.push({ ...event });
      }
    }
    return claimed;
  }

  async markPublished(id: string): Promise<void> {
    const found = this.events.find((e) => e.id === id);
    if (found) {
      found.status = OutboxStatus.PUBLISHED;
      found.payload = { redacted: true };
    }
  }

  async markRetryOrFailed(input: MarkPasswordResetOutboxRetryInput): Promise<void> {
    const found = this.events.find((e) => e.id === input.id);
    if (found) {
      found.attempts = input.nextAttempts;
      found.availableAt = input.nextAvailableAt;
      const terminal = input.nextAttempts >= input.maxAttempts;
      found.status = terminal ? OutboxStatus.FAILED : OutboxStatus.PENDING;
      if (terminal) {
        found.payload = { redacted: true, failed: true };
      }
    }
  }
}

describe('PasswordResetOutboxDispatcher', () => {
  const cipher = new OutboxPayloadCipher('0123456789abcdef0123456789abcdef0123456789abcdef');

  it('decouples request completion from slow/hanging email provider delivery while preserving durable outbox state', async () => {
    const nowMs = new Date('2026-11-27T10:00:00Z').getTime();
    const outbox = new InMemoryOutboxStore();
    const tokenService = new CryptoVerificationTokenService();

    let resolveDelivery!: () => void;
    const sentPayloads: PasswordResetEmailPayload[] = [];
    const slowEmailSender: EmailSender = {
      async sendVerificationEmail(_payload: VerificationEmailPayload): Promise<void> {},
      async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
        sentPayloads.push(payload);
        await new Promise<void>((resolve) => {
          resolveDelivery = resolve;
        });
      },
    };

    const dispatcher = new PasswordResetOutboxDispatcher({
      outboxRepository: outbox,
      emailSender: slowEmailSender,
      payloadCipher: cipher,
      clock: () => new Date(nowMs),
    });

    const userRepo: UserRepository = {
      async findByEmail(): Promise<UserRecord | null> {
        return {
          id: 'u-active',
          displayName: 'Active User',
          email: 'active@example.com',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(nowMs),
          createdAt: new Date(nowMs),
          updatedAt: new Date(nowMs),
        };
      },
      async findCredentialsByEmail(): Promise<UserCredentialRecord | null> {
        return null;
      },
      async create(input: CreateUserInput): Promise<UserRecord> {
        return {
          id: 'u-new',
          displayName: input.displayName,
          email: input.email,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: null,
          createdAt: new Date(nowMs),
          updatedAt: new Date(nowMs),
        };
      },
    };

    const tokenRepo: PasswordResetTokenRepository = {
      async issueToken(input: IssuePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
        return {
          id: 'prt-1',
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          usedAt: null,
          createdAt: input.now,
        };
      },
      async issueTokenWithOutbox(
        input: IssuePasswordResetTokenWithOutboxInput,
      ): Promise<PasswordResetTokenRecord> {
        outbox.events.push({
          id: 'obx-1',
          eventType: input.outboxEvent.eventType,
          aggregateType: input.outboxEvent.aggregateType,
          aggregateId: input.outboxEvent.aggregateId,
          payload: input.outboxEvent.payload,
          status: OutboxStatus.PENDING,
          attempts: 0,
          availableAt: input.now,
          createdAt: input.now,
        });
        return this.issueToken(input);
      },
      async hasEligibleToken(): Promise<boolean> {
        return false;
      },
      async consumeAndResetPassword(): Promise<ConsumePasswordResetTokenOutcome> {
        return 'invalid_or_expired';
      },
    };

    const useCase = new RequestPasswordResetUseCase({
      userRepository: userRepo,
      tokenRepository: tokenRepo,
      tokenService,
      payloadCipher: cipher,
      outboxNotifier: dispatcher,
      appWebUrl: 'https://jobs.example.com',
      clock: () => new Date(nowMs),
    });

    // Request resolves immediately while email provider never resolved yet
    const response = await useCase.execute({ email: 'active@example.com' });
    expect(response).toEqual({
      accepted: true,
      message: GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
    });
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]!.status).toBe(OutboxStatus.PENDING);

    // Yield event loop so dispatcher claims the item and starts waiting on slowEmailSender
    await new Promise((resolve) => setImmediate(resolve));
    expect(sentPayloads).toHaveLength(1);
    expect(outbox.events[0]!.status).toBe(OutboxStatus.PROCESSING);

    // Finish provider call and wait for dispatcher completion
    resolveDelivery();
    await dispatcher.waitForIdle();

    expect(outbox.events[0]!.status).toBe(OutboxStatus.PUBLISHED);
    expect(outbox.events[0]!.payload).toEqual({ redacted: true });
    await dispatcher.stop();
  });

  it('retries failed deliveries with sanitized logging and marks terminal failure after maxAttempts', async () => {
    let nowMs = new Date('2026-11-27T10:00:00Z').getTime();
    const outbox = new InMemoryOutboxStore();
    outbox.events.push({
      id: 'obx-retry',
      eventType: 'identity.password_reset_email.requested',
      aggregateType: 'user',
      aggregateId: 'u-1',
      payload: cipher.sealJson({
        to: 'abebe@example.com',
        displayName: 'Abebe',
        resetUrl: 'https://jobs.example.com/reset-password?token=secret-token-value',
        expiresInMinutes: 30,
      }),
      status: OutboxStatus.PENDING,
      attempts: 0,
      availableAt: new Date(nowMs),
      createdAt: new Date(nowMs),
    });

    const failingSender: EmailSender = {
      async sendVerificationEmail(): Promise<void> {},
      async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
        throw new Error(`Provider failed for ${payload.resetUrl}`);
      },
    };

    const dispatcher = new PasswordResetOutboxDispatcher({
      outboxRepository: outbox,
      emailSender: failingSender,
      payloadCipher: cipher,
      clock: () => new Date(nowMs),
      maxAttempts: 2,
      baseRetryDelayMs: 5_000,
    });

    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    await dispatcher.drain();
    expect(outbox.events[0]!.attempts).toBe(1);
    expect(outbox.events[0]!.status).toBe(OutboxStatus.PENDING);
    expect(outbox.events[0]!.availableAt.getTime()).toBe(nowMs + 5_000);

    // Before backoff window elapses, second drain does not claim
    await dispatcher.drain();
    expect(outbox.events[0]!.attempts).toBe(1);

    // Advance past backoff window -> terminal FAILED after 2nd attempt
    nowMs += 5_000;
    await dispatcher.drain();
    expect(outbox.events[0]!.attempts).toBe(2);
    expect(outbox.events[0]!.status).toBe(OutboxStatus.FAILED);
    expect(outbox.events[0]!.payload).toEqual({ redacted: true, failed: true });

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('[REDACTED_RESET_URL]');
    expect(logged).not.toContain('secret-token-value');

    errorSpy.mockRestore();
  });
});
