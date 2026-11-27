import type { OutboxStatus } from '../../../generated/prisma/enums.js';

export const PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE = 'identity.password_reset_email.requested';

export interface PasswordResetOutboxRecord {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  availableAt: Date;
  createdAt: Date;
}

export interface MarkPasswordResetOutboxRetryInput {
  id: string;
  nextAttempts: number;
  maxAttempts: number;
  nextAvailableAt: Date;
}

export interface PasswordResetOutboxRepository {
  claimPendingBatch(
    limit: number,
    now: Date,
    leaseMs: number,
  ): Promise<PasswordResetOutboxRecord[]>;
  markPublished(id: string): Promise<void>;
  markRetryOrFailed(input: MarkPasswordResetOutboxRetryInput): Promise<void>;
}
