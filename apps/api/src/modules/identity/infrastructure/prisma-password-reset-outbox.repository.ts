import { PrismaClient } from '../../../generated/prisma/client.js';
import { OutboxStatus } from '../../../generated/prisma/enums.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import {
  PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE,
  type MarkPasswordResetOutboxRetryInput,
  type PasswordResetOutboxRecord,
  type PasswordResetOutboxRepository,
} from '../ports/password-reset-outbox.repository.js';

interface LockedOutboxRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  available_at: Date;
  created_at: Date;
}

export class PrismaPasswordResetOutboxRepository implements PasswordResetOutboxRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  async claimPendingBatch(
    limit: number,
    now: Date,
    leaseMs: number,
  ): Promise<PasswordResetOutboxRecord[]> {
    const leaseUntil = new Date(now.getTime() + leaseMs);

    return this.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedOutboxRow[]>`
        SELECT id, event_type, aggregate_type, aggregate_id, payload, status, attempts, available_at, created_at
        FROM outbox_events
        WHERE event_type = ${PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE}
          AND (
            (status = 'PENDING'::"OutboxStatus" AND available_at <= ${now})
            OR (status = 'PROCESSING'::"OutboxStatus" AND available_at <= ${now})
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}::int
      `;

      if (rows.length === 0) {
        return [];
      }

      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: {
          status: OutboxStatus.PROCESSING,
          availableAt: leaseUntil,
        },
      });

      return rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        payload: row.payload,
        status: OutboxStatus.PROCESSING,
        attempts: row.attempts,
        availableAt: leaseUntil,
        createdAt: new Date(row.created_at),
      }));
    });
  }

  async markPublished(id: string): Promise<void> {
    await this.client.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PUBLISHED,
        payload: { redacted: true },
      },
    });
  }

  async markRetryOrFailed(input: MarkPasswordResetOutboxRetryInput): Promise<void> {
    const terminalFailure = input.nextAttempts >= input.maxAttempts;
    await this.client.outboxEvent.update({
      where: { id: input.id },
      data: {
        attempts: input.nextAttempts,
        availableAt: input.nextAvailableAt,
        status: terminalFailure ? OutboxStatus.FAILED : OutboxStatus.PENDING,
        ...(terminalFailure ? { payload: { redacted: true, failed: true } } : {}),
      },
    });
  }
}
