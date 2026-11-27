import { randomUUID } from 'node:crypto';
import type { RefreshResponseData } from '@jmp/contracts';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import type { AccessTokenService } from '../domain/access-token.js';
import type { RefreshTokenService } from '../domain/refresh-token.js';
import type { Clock } from '../domain/verification-token.js';
import type { SessionRepository } from '../ports/session.repository.js';

export interface RefreshSessionUseCaseResult {
  response: RefreshResponseData;
  refreshToken: string;
}

export interface RefreshSessionUseCaseOptions {
  sessionRepository: SessionRepository;
  accessTokenService: AccessTokenService;
  refreshTokenService: RefreshTokenService;
  clock?: Clock | undefined;
}

function invalidSessionError(): AppError {
  return new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired session.');
}

export class RefreshSessionUseCase {
  private readonly sessionRepository: SessionRepository;
  private readonly accessTokenService: AccessTokenService;
  private readonly refreshTokenService: RefreshTokenService;
  private readonly clock: Clock;

  constructor(options: RefreshSessionUseCaseOptions) {
    this.sessionRepository = options.sessionRepository;
    this.accessTokenService = options.accessTokenService;
    this.refreshTokenService = options.refreshTokenService;
    this.clock = options.clock ?? (() => new Date());
  }

  async execute(rawRefreshToken: string | null | undefined): Promise<RefreshSessionUseCaseResult> {
    if (typeof rawRefreshToken !== 'string' || rawRefreshToken.length === 0) {
      throw invalidSessionError();
    }

    const now = this.clock();
    const presentedTokenHash = this.refreshTokenService.hashToken(rawRefreshToken);

    const candidate =
      await this.sessionRepository.findRotationCandidateByTokenHash(presentedTokenHash);
    if (!candidate) {
      throw invalidSessionError();
    }

    if (candidate.session.revokedAt !== null) {
      await this.sessionRepository.revokeFamilyIfReplayed(presentedTokenHash, now);
      throw invalidSessionError();
    }

    if (
      candidate.session.expiresAt.getTime() <= now.getTime() ||
      candidate.user.status !== UserStatus.ACTIVE ||
      candidate.user.emailVerifiedAt === null
    ) {
      throw invalidSessionError();
    }

    // Generate new credentials and sign the candidate JWT BEFORE committing rotation,
    // so a signing failure never consumes the active refresh session.
    const newSessionId = randomUUID();
    const newRawRefreshToken = this.refreshTokenService.generateToken();
    const newRefreshTokenHash = this.refreshTokenService.hashToken(newRawRefreshToken);

    const { token: accessToken, expiresIn } = await this.accessTokenService.sign({
      userId: candidate.user.id,
      sessionId: newSessionId,
      now,
    });

    const rotation = await this.sessionRepository.rotateSession({
      presentedTokenHash,
      newSessionId,
      newRefreshTokenHash,
      now,
    });

    if (rotation.outcome !== 'rotated') {
      throw invalidSessionError();
    }

    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn,
        user: rotation.user,
      },
      refreshToken: newRawRefreshToken,
    };
  }
}
