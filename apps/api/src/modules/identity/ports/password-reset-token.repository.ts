export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface IssuePasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface EnqueuePasswordResetOutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

export interface IssuePasswordResetTokenWithOutboxInput extends IssuePasswordResetTokenInput {
  outboxEvent: EnqueuePasswordResetOutboxEventInput;
}

export interface ConsumePasswordResetTokenInput {
  tokenHash: string;
  newPasswordHash: string;
  now: Date;
}

export type ConsumePasswordResetTokenOutcome = 'reset' | 'invalid_or_expired';

export interface PasswordResetTokenRepository {
  issueToken(input: IssuePasswordResetTokenInput): Promise<PasswordResetTokenRecord>;
  issueTokenWithOutbox(
    input: IssuePasswordResetTokenWithOutboxInput,
  ): Promise<PasswordResetTokenRecord>;
  hasEligibleToken(tokenHash: string, now: Date): Promise<boolean>;
  consumeAndResetPassword(
    input: ConsumePasswordResetTokenInput,
  ): Promise<ConsumePasswordResetTokenOutcome>;
}
