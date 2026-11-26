import {
  normalizeEmail,
  type ResendVerificationRequest,
  type ResendVerificationResponseData,
} from '@jmp/contracts';
import type { UserRepository } from '../ports/user.repository.js';
import type { VerificationEmailIssuer } from './verification-email-issuer.js';

const GENERIC_RESEND_MESSAGE =
  'If an unverified account exists for that email address, a verification email has been sent.';

export class ResendVerificationUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly verificationEmailIssuer: VerificationEmailIssuer,
  ) {}

  async execute(input: ResendVerificationRequest): Promise<ResendVerificationResponseData> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = await this.userRepository.findByEmail(normalizedEmail);

    // Only issue and send for existing unverified accounts; never reveal account status publicly
    if (user && user.emailVerifiedAt === null) {
      await this.verificationEmailIssuer.issueAndSend({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
      });
    }

    return {
      accepted: true,
      message: GENERIC_RESEND_MESSAGE,
    };
  }
}
