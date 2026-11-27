import type { LogoutResponseData } from '@jmp/contracts';
import type { RefreshTokenService } from '../domain/refresh-token.js';
import type { Clock } from '../domain/verification-token.js';
import type { SessionRepository } from '../ports/session.repository.js';

export interface LogoutSessionUseCaseOptions {
  sessionRepository: SessionRepository;
  refreshTokenService: RefreshTokenService;
  clock?: Clock | undefined;
}

export class LogoutSessionUseCase {
  private readonly sessionRepository: SessionRepository;
  private readonly refreshTokenService: RefreshTokenService;
  private readonly clock: Clock;

  constructor(options: LogoutSessionUseCaseOptions) {
    this.sessionRepository = options.sessionRepository;
    this.refreshTokenService = options.refreshTokenService;
    this.clock = options.clock ?? (() => new Date());
  }

  async execute(rawRefreshToken: string | null | undefined): Promise<LogoutResponseData> {
    if (typeof rawRefreshToken === 'string' && rawRefreshToken.length > 0) {
      const tokenHash = this.refreshTokenService.hashToken(rawRefreshToken);
      await this.sessionRepository.revokeFamilyByTokenHash(tokenHash, this.clock());
    }

    return { loggedOut: true };
  }
}
