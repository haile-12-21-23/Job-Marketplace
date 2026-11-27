import type { ConfirmPasswordResetRequest, ConfirmPasswordResetResponseData } from '@jmp/contracts';
import { AppError } from '../../../errors/app-error.js';
import type { PasswordHasher } from '../domain/password-hasher.js';
import type { Clock, VerificationTokenService } from '../domain/verification-token.js';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token.repository.js';

export interface ConfirmPasswordResetUseCaseOptions {
  tokenRepository: PasswordResetTokenRepository;
  tokenService: VerificationTokenService;
  passwordHasher: PasswordHasher;
  clock?: Clock | undefined;
}

export class ConfirmPasswordResetUseCase {
  private readonly tokenRepository: PasswordResetTokenRepository;
  private readonly tokenService: VerificationTokenService;
  private readonly passwordHasher: PasswordHasher;
  private readonly clock: Clock;

  constructor(options: ConfirmPasswordResetUseCaseOptions) {
    this.tokenRepository = options.tokenRepository;
    this.tokenService = options.tokenService;
    this.passwordHasher = options.passwordHasher;
    this.clock = options.clock ?? (() => new Date());
  }

  async execute(input: ConfirmPasswordResetRequest): Promise<ConfirmPasswordResetResponseData> {
    const now = this.clock();
    const tokenHash = this.tokenService.hashToken(input.token);
    const newPasswordHash = await this.passwordHasher.hash(input.newPassword);

    const outcome = await this.tokenRepository.consumeAndResetPassword({
      tokenHash,
      newPasswordHash,
      now,
    });

    if (outcome !== 'reset') {
      throw new AppError(
        400,
        'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN',
        'This password reset link is invalid or has expired. Request a new link.',
      );
    }

    return {
      reset: true,
      message: 'Your password has been reset. You can now sign in with your new password.',
    };
  }
}
