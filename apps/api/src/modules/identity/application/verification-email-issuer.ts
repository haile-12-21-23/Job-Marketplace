import { logger } from '../../../observability/logger.js';
import type { Clock, VerificationTokenService } from '../domain/verification-token.js';
import type { EmailSender } from '../ports/email-sender.js';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository.js';

export interface IssueVerificationEmailInput {
  userId: string;
  email: string;
  displayName: string;
}

export interface VerificationEmailIssuerOptions {
  tokenRepository: EmailVerificationTokenRepository;
  tokenService: VerificationTokenService;
  emailSender: EmailSender;
  appWebUrl: string;
  tokenTtlMinutes: number;
  clock?: Clock | undefined;
}

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unknown email delivery error';
  return raw.replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

/**
 * Coordinates secure token generation, hashed persistence (superseding prior active tokens),
 * and safe email dispatch without exposing raw tokens, hashes, or verification URLs in logs.
 */
export class VerificationEmailIssuer {
  private readonly tokenRepository: EmailVerificationTokenRepository;
  private readonly tokenService: VerificationTokenService;
  private readonly emailSender: EmailSender;
  private readonly appWebUrl: string;
  private readonly tokenTtlMinutes: number;
  private readonly clock: Clock;

  constructor(options: VerificationEmailIssuerOptions) {
    this.tokenRepository = options.tokenRepository;
    this.tokenService = options.tokenService;
    this.emailSender = options.emailSender;
    this.appWebUrl = options.appWebUrl;
    this.tokenTtlMinutes = options.tokenTtlMinutes;
    this.clock = options.clock ?? (() => new Date());
  }

  async issueAndSend(input: IssueVerificationEmailInput): Promise<void> {
    const now = this.clock();
    const rawToken = this.tokenService.generateToken();
    const tokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + this.tokenTtlMinutes * 60_000);

    await this.tokenRepository.issueToken({
      userId: input.userId,
      tokenHash,
      expiresAt,
      now,
    });

    const verificationUrl = this.tokenService.buildVerificationUrl(this.appWebUrl, rawToken);

    try {
      await this.emailSender.sendVerificationEmail({
        to: input.email,
        displayName: input.displayName,
        verificationUrl,
        expiresInMinutes: this.tokenTtlMinutes,
      });
    } catch (err) {
      logger.error(
        {
          event: 'verification_email_dispatch_failed',
          userId: input.userId,
          errorMessage: sanitizeErrorMessage(err),
        },
        'Failed to dispatch verification email',
      );
    }
  }
}
