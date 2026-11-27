import {
  normalizeEmail,
  type RequestPasswordResetRequest,
  type RequestPasswordResetResponseData,
} from '@jmp/contracts';
import { UserStatus } from '../../../generated/prisma/enums.js';
import type { OutboxPayloadCipher } from '../domain/outbox-payload-cipher.js';
import type { Clock, VerificationTokenService } from '../domain/verification-token.js';
import { PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE } from '../ports/password-reset-outbox.repository.js';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token.repository.js';
import type { UserRepository } from '../ports/user.repository.js';
import type { OutboxWorkNotifier } from './password-reset-outbox-dispatcher.js';

export const GENERIC_PASSWORD_RESET_REQUEST_MESSAGE =
  'If an account matches that email address, password reset instructions will be sent.';

export interface RequestPasswordResetUseCaseOptions {
  userRepository: UserRepository;
  tokenRepository: PasswordResetTokenRepository;
  tokenService: VerificationTokenService;
  payloadCipher: OutboxPayloadCipher;
  outboxNotifier: OutboxWorkNotifier;
  appWebUrl: string;
  tokenTtlMinutes?: number | undefined;
  clock?: Clock | undefined;
}

export class RequestPasswordResetUseCase {
  private readonly userRepository: UserRepository;
  private readonly tokenRepository: PasswordResetTokenRepository;
  private readonly tokenService: VerificationTokenService;
  private readonly payloadCipher: OutboxPayloadCipher;
  private readonly outboxNotifier: OutboxWorkNotifier;
  private readonly appWebUrl: string;
  private readonly tokenTtlMinutes: number;
  private readonly clock: Clock;

  constructor(options: RequestPasswordResetUseCaseOptions) {
    this.userRepository = options.userRepository;
    this.tokenRepository = options.tokenRepository;
    this.tokenService = options.tokenService;
    this.payloadCipher = options.payloadCipher;
    this.outboxNotifier = options.outboxNotifier;
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
    const resetUrl = this.tokenService.buildPasswordResetUrl(this.appWebUrl, rawToken);

    const sealedPayload = this.payloadCipher.sealJson({
      to: user.email,
      displayName: user.displayName,
      resetUrl,
      expiresInMinutes: this.tokenTtlMinutes,
    });

    // Atomically persist hashed token + encrypted durable outbox event so HTTP response
    // never blocks on external mail-provider latency and survives restarts safely.
    await this.tokenRepository.issueTokenWithOutbox({
      userId: user.id,
      tokenHash,
      expiresAt,
      now,
      outboxEvent: {
        eventType: PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE,
        aggregateType: 'user',
        aggregateId: user.id,
        payload: sealedPayload,
      },
    });

    this.outboxNotifier.notify();

    return genericResponse;
  }
}
