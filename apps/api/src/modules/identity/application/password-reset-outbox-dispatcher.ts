import { logger } from '../../../observability/logger.js';
import type { OutboxPayloadCipher } from '../domain/outbox-payload-cipher.js';
import type { Clock } from '../domain/verification-token.js';
import type { EmailSender, PasswordResetEmailPayload } from '../ports/email-sender.js';
import type { PasswordResetOutboxRepository } from '../ports/password-reset-outbox.repository.js';

export interface OutboxWorkNotifier {
  notify(): void;
}

export interface PasswordResetOutboxDispatcherOptions {
  outboxRepository: PasswordResetOutboxRepository;
  emailSender: EmailSender;
  payloadCipher: OutboxPayloadCipher;
  clock?: Clock | undefined;
  batchSize?: number | undefined;
  maxAttempts?: number | undefined;
  baseRetryDelayMs?: number | undefined;
  leaseMs?: number | undefined;
  pollIntervalMs?: number | undefined;
}

export function sanitizePasswordResetDispatchError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unknown email delivery error';
  return raw
    .replace(/https?:\/\/\S*reset-password\S*/gi, '[REDACTED_RESET_URL]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

/**
 * Asynchronous durable outbox worker for password reset emails.
 * Claims persisted PostgreSQL OutboxEvent rows with lease-based locking, decrypts the one-time
 * payload in memory, dispatches via EmailSender, and updates publication or retry state without
 * blocking HTTP request handlers or exposing raw reset tokens in error logs.
 */
export class PasswordResetOutboxDispatcher implements OutboxWorkNotifier {
  private readonly outboxRepository: PasswordResetOutboxRepository;
  private readonly emailSender: EmailSender;
  private readonly payloadCipher: OutboxPayloadCipher;
  private readonly clock: Clock;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly baseRetryDelayMs: number;
  private readonly leaseMs: number;
  private readonly pollIntervalMs: number;

  private activeDrain: Promise<number> | null = null;
  private wakeupScheduled = false;
  private rerunRequested = false;
  private stopped = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: PasswordResetOutboxDispatcherOptions) {
    this.outboxRepository = options.outboxRepository;
    this.emailSender = options.emailSender;
    this.payloadCipher = options.payloadCipher;
    this.clock = options.clock ?? (() => new Date());
    this.batchSize = options.batchSize ?? 10;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 5_000;
    this.leaseMs = options.leaseMs ?? 120_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
  }

  /**
   * Signals that a durable OutboxEvent was committed; schedules async background drain
   * on the next event-loop turn without coupling caller latency to email delivery.
   */
  notify(): void {
    if (this.stopped) return;
    if (this.activeDrain) {
      this.rerunRequested = true;
      return;
    }
    if (this.wakeupScheduled) return;

    this.wakeupScheduled = true;
    setImmediate(() => {
      this.wakeupScheduled = false;
      if (!this.stopped) {
        void this.drain().catch(() => {
          // Errors are logged inside drain loop; never raise unhandled rejection from notify
        });
      }
    });
  }

  start(): void {
    if (this.pollTimer || this.stopped) return;
    this.pollTimer = setInterval(() => {
      this.notify();
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
    this.notify();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.waitForIdle();
  }

  async waitForIdle(): Promise<void> {
    if (this.wakeupScheduled) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (this.activeDrain) {
      await this.activeDrain;
    }
  }

  async drain(): Promise<number> {
    if (this.activeDrain) {
      this.rerunRequested = true;
      return this.activeDrain;
    }

    const drainPromise = this.runDrainLoop();
    this.activeDrain = drainPromise;
    try {
      return await drainPromise;
    } finally {
      this.activeDrain = null;
    }
  }

  private async runDrainLoop(): Promise<number> {
    let processedCount = 0;

    do {
      this.rerunRequested = false;

      while (!this.stopped) {
        const now = this.clock();
        const batch = await this.outboxRepository.claimPendingBatch(
          this.batchSize,
          now,
          this.leaseMs,
        );
        if (batch.length === 0) {
          break;
        }

        for (const record of batch) {
          processedCount++;
          try {
            const payload = this.payloadCipher.unsealJson<PasswordResetEmailPayload>(
              record.payload,
            );
            await this.emailSender.sendPasswordResetEmail(payload);
            await this.outboxRepository.markPublished(record.id);
          } catch (err) {
            const nextAttempts = record.attempts + 1;
            const retryDelayMs = this.baseRetryDelayMs * Math.pow(2, Math.max(0, nextAttempts - 1));
            const nextAvailableAt = new Date(this.clock().getTime() + retryDelayMs);

            logger.error(
              {
                event: 'password_reset_email_dispatch_failed',
                outboxEventId: record.id,
                aggregateId: record.aggregateId,
                attempt: nextAttempts,
                maxAttempts: this.maxAttempts,
                errorMessage: sanitizePasswordResetDispatchError(err),
              },
              'Failed to dispatch queued password reset email',
            );

            await this.outboxRepository.markRetryOrFailed({
              id: record.id,
              nextAttempts,
              maxAttempts: this.maxAttempts,
              nextAvailableAt,
            });
          }
        }
      }
    } while (this.rerunRequested && !this.stopped);

    return processedCount;
  }
}
