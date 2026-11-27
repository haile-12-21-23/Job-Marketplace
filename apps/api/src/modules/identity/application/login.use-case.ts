import { randomUUID } from 'node:crypto';
import { normalizeEmail, type LoginRequest, type LoginResponseData } from '@jmp/contracts';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import type { PasswordHasher } from '../domain/password-hasher.js';
import type { AccessTokenService } from '../domain/access-token.js';
import type { RefreshTokenService } from '../domain/refresh-token.js';
import type { Clock } from '../domain/verification-token.js';
import type { UserRepository } from '../ports/user.repository.js';
import type { SessionRepository } from '../ports/session.repository.js';

// Precomputed valid bcrypt hash used to run constant-work comparison for unknown emails.
const DUMMY_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const MS_PER_DAY = 86_400_000;

export interface LoginUseCaseResult {
  response: LoginResponseData;
  refreshToken: string;
}

export interface LoginUseCaseOptions {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  passwordHasher: PasswordHasher;
  accessTokenService: AccessTokenService;
  refreshTokenService: RefreshTokenService;
  refreshTokenTtlDays?: number | undefined;
  clock?: Clock | undefined;
}

export class LoginUseCase {
  private readonly userRepository: UserRepository;
  private readonly sessionRepository: SessionRepository;
  private readonly passwordHasher: PasswordHasher;
  private readonly accessTokenService: AccessTokenService;
  private readonly refreshTokenService: RefreshTokenService;
  private readonly refreshTokenTtlDays: number;
  private readonly clock: Clock;

  constructor(options: LoginUseCaseOptions) {
    this.userRepository = options.userRepository;
    this.sessionRepository = options.sessionRepository;
    this.passwordHasher = options.passwordHasher;
    this.accessTokenService = options.accessTokenService;
    this.refreshTokenService = options.refreshTokenService;
    this.refreshTokenTtlDays = options.refreshTokenTtlDays ?? 30;
    this.clock = options.clock ?? (() => new Date());
  }

  async execute(input: LoginRequest): Promise<LoginUseCaseResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = await this.userRepository.findCredentialsByEmail(normalizedEmail);

    if (!user) {
      await this.passwordHasher.compare(input.password, DUMMY_BCRYPT_HASH);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const passwordMatches = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordMatches || user.status !== UserStatus.ACTIVE || user.emailVerifiedAt === null) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const now = this.clock();
    const rawRefreshToken = this.refreshTokenService.generateToken();
    const refreshTokenHash = this.refreshTokenService.hashToken(rawRefreshToken);
    const tokenFamilyId = randomUUID();
    const expiresAt = new Date(now.getTime() + this.refreshTokenTtlDays * MS_PER_DAY);

    // Persist the session atomically while verifying credentials were not rotated by a concurrent password reset.
    const sessionResult = await this.sessionRepository.createAuthenticatedSession({
      userId: user.id,
      tokenFamilyId,
      refreshTokenHash,
      parentSessionId: null,
      expiresAt,
      expectedPasswordHash: user.passwordHash,
    });
    if (sessionResult.outcome !== 'created') {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const { token: accessToken, expiresIn } = await this.accessTokenService.sign({
      userId: user.id,
      sessionId: sessionResult.session.id,
      now,
    });

    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn,
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
        },
      },
      refreshToken: rawRefreshToken,
    };
  }
}
