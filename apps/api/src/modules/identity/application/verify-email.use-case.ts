import type { VerifyEmailRequest, VerifyEmailResponseData } from '@jmp/contracts';
import { AppError } from '../../../errors/app-error.js';
import type { Clock, VerificationTokenService } from '../domain/verification-token.js';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository.js';

export class VerifyEmailUseCase {
  private readonly tokenRepository: EmailVerificationTokenRepository;
  private readonly tokenService: VerificationTokenService;
  private readonly clock: Clock;

  constructor(
    tokenRepository: EmailVerificationTokenRepository,
    tokenService: VerificationTokenService,
    clock?: Clock | undefined,
  ) {
    this.tokenRepository = tokenRepository;
    this.tokenService = tokenService;
    this.clock = clock ?? (() => new Date());
  }

  async execute(input: VerifyEmailRequest): Promise<VerifyEmailResponseData> {
    const tokenHash = this.tokenService.hashToken(input.token);
    const outcome = await this.tokenRepository.consumeAndVerifyUser(tokenHash, this.clock());

    if (outcome !== 'verified') {
      throw new AppError(
        400,
        'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
        'This verification link is invalid or has expired. Please request a new verification email.',
      );
    }

    return {
      verified: true,
      message: 'Your email address has been verified.',
    };
  }
}
