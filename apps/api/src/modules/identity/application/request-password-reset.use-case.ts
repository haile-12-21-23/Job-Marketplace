import {
  normalizeEmail,
  type RequestPasswordResetRequest,
  type RequestPasswordResetResponseData,
} from '@jmp/contracts';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { logger } from '../../../observability/logger.js';
import type { Clock, VerificationTokenService } from '../domain/verification-token.js';
import type { EmailSender } from '../ports/email-sender.js';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token.repository.js';
import type { UserRepository } from '../ports/user.repository.js';

export const GENERIC_PASSWORD_RESET_REQUEST_MESSAGE =
  'If an account matches that email address, password reset instructions will be sent.';

export interface RequestPasswordResetUseCaseOptions {
  userRepository: UserRepository;
  tokenRepository: PasswordResetTokenRepository;
  tokenService: VerificationTokenService;
  emailSender: EmailSender;
  appWebUrl: string;
  tokenTtlMinutes?: number | undefined;
  clock?: Clock | undefined;
}

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unknown email delivery error';
  return raw
    .replace(/https?:\/\/\S*reset-password\S*/gi, '[REDACTED_RESET_URL]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

export class RequestPasswordResetUseCase {
  private readonly userRepository: UserRepository;
  private readonly tokenRepository: PasswordResetTokenRepository;
  private readonly tokenService: VerificationTokenService;
  private readonly emailSender: EmailSender;
  private readonly appWebUrl: string;
  private readonly tokenTtlMinutes: number;
  private readonly clock: Clock;

  constructor(options: RequestPasswordResetUseCaseOptions) {
    this.userRepository = options.userRepository;
    this.tokenRepository = options.tokenRepository;
    this.tokenService = options.tokenService;
    this.emailSender = options.emailSender;
    this.appWebUrl = options.appWebUrl;
    this.tokenTtlMinutes = options.tokenTtlMinutes ?? 30;
    this.clock = options.clock ?? (() => new Date());
  }

  async execute(input: RequestPasswordResetRequest): Promise<RequestPasswordResetResponseData> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = await this.userRepository.findByEmail(normalizedEmail);

    const genericResponse: RequestPasswordResetResponseData = {
      accepted: true,
      message: GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
    };

    // Anti-enumeration gate: only ACTIVE, email-verified accounts receive a reset email
    if (!user || user.status !== UserStatus.ACTIVE || user.emailVerifiedAt === null) {
      return genericResponse;
    }

    const now = this.clock();
    const rawToken = this.tokenService.generateToken();
    const tokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + this.tokenTtlMinutes * 60_000);

    await this.tokenRepository.issueToken({
      userId: user.id,
      tokenHash,
      expiresAt,
      now,
    });

    const resetUrl = this.tokenService.buildPasswordResetUrl(this.appWebUrl, rawToken);

    try {
      await this.emailSender.sendPasswordResetEmail({
        to: user.email,
        displayName: user.displayName,
        resetUrl,
        expiresInMinutes: this.tokenTtlMinutes,
      });
    } catch (err) {
      logger.error(
        {
          event: 'password_reset_email_dispatch_failed',
          userId: user.id,
          errorMessage: sanitizeErrorMessage(err),
        },
        'Failed to dispatch password reset email',
      );
    }

    return genericResponse;
  }
}
