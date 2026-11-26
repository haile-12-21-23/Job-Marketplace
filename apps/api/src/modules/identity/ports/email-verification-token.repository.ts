export interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface IssueVerificationTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export type ConsumeVerificationTokenOutcome = 'verified' | 'invalid_or_expired';

export interface EmailVerificationTokenRepository {
  /**
   * Atomically supersedes any active (unconsumed) verification tokens for the user
   * and persists a new hashed verification token.
   */
  issueToken(input: IssueVerificationTokenInput): Promise<EmailVerificationTokenRecord>;

  /**
   * Atomically validates, consumes a matching active/unexpired token, and sets
   * User.emailVerifiedAt if not already verified.
   */
  consumeAndVerifyUser(tokenHash: string, now: Date): Promise<ConsumeVerificationTokenOutcome>;
}
