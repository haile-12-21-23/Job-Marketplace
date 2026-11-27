import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../../../errors/app-error.js';
import type { PasswordHasher } from '../domain/password-hasher.js';
import { CryptoVerificationTokenService } from '../domain/verification-token.js';
import type {
  ConsumePasswordResetTokenInput,
  ConsumePasswordResetTokenOutcome,
  PasswordResetTokenRepository,
} from '../ports/password-reset-token.repository.js';
import { ConfirmPasswordResetUseCase } from './confirm-password-reset.use-case.js';

describe('ConfirmPasswordResetUseCase', () => {
  const now = new Date('2026-11-27T10:30:00Z');
  const tokenService = new CryptoVerificationTokenService();
  const hasher: PasswordHasher = {
    async hash(plaintext: string): Promise<string> {
      return `hashed_${plaintext}`;
    },
    async compare(plaintext: string, hash: string): Promise<boolean> {
      return hash === `hashed_${plaintext}`;
    },
  };

  it('hashes new password and token, and returns reset confirmation when repository succeeds', async () => {
    const consumeMock = vi.fn(async (_input: ConsumePasswordResetTokenInput) => 'reset' as const);
    const repo: PasswordResetTokenRepository = {
      async issueToken() {
        throw new Error('unused');
      },
      consumeAndResetPassword: consumeMock,
    };

    const useCase = new ConfirmPasswordResetUseCase({
      tokenRepository: repo,
      tokenService,
      passwordHasher: hasher,
      clock: () => now,
    });

    const rawToken = tokenService.generateToken();
    const res = await useCase.execute({
      token: rawToken,
      newPassword: 'NewStrongPassword123!',
    });

    expect(res).toEqual({
      reset: true,
      message: 'Your password has been reset. You can now sign in with your new password.',
    });
    expect(consumeMock).toHaveBeenCalledWith({
      tokenHash: tokenService.hashToken(rawToken),
      newPasswordHash: 'hashed_NewStrongPassword123!',
      now,
    });
  });

  it('throws generic 400 INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN on invalid, expired, or used token', async () => {
    const repo: PasswordResetTokenRepository = {
      async issueToken() {
        throw new Error('unused');
      },
      async consumeAndResetPassword(): Promise<ConsumePasswordResetTokenOutcome> {
        return 'invalid_or_expired';
      },
    };

    const useCase = new ConfirmPasswordResetUseCase({
      tokenRepository: repo,
      tokenService,
      passwordHasher: hasher,
      clock: () => now,
    });

    await expect(
      useCase.execute({ token: 'bad-token', newPassword: 'NewStrongPassword123!' }),
    ).rejects.toThrowError(AppError);

    await expect(
      useCase.execute({ token: 'bad-token', newPassword: 'NewStrongPassword123!' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN',
      message: 'This password reset link is invalid or has expired. Request a new link.',
    });
  });
});
