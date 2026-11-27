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

export interface ConsumePasswordResetTokenInput {
  tokenHash: string;
  newPasswordHash: string;
  now: Date;
}

export type ConsumePasswordResetTokenOutcome = 'reset' | 'invalid_or_expired';

export interface PasswordResetTokenRepository {
  issueToken(input: IssuePasswordResetTokenInput): Promise<PasswordResetTokenRecord>;
  consumeAndResetPassword(
    input: ConsumePasswordResetTokenInput,
  ): Promise<ConsumePasswordResetTokenOutcome>;
}
