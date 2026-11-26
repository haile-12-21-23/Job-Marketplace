import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  loginRequestSchema,
  normalizeEmail,
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
} from '@jmp/contracts';
import { AppError } from '../../errors/app-error.js';
import { validateBody } from '../../middleware/validate.js';
import { IdentityController } from './identity.controller.js';
import { RegisterUserUseCase } from './application/register-user.use-case.js';
import { VerifyEmailUseCase } from './application/verify-email.use-case.js';
import { ResendVerificationUseCase } from './application/resend-verification.use-case.js';
import { VerificationEmailIssuer } from './application/verification-email-issuer.js';
import { LoginUseCase } from './application/login.use-case.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { PrismaEmailVerificationTokenRepository } from './infrastructure/prisma-email-verification-token.repository.js';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository.js';
import { DevelopmentEmailSender } from './infrastructure/email-sender.js';
import { ResendRateLimiter } from './infrastructure/resend-rate-limiter.js';
import { LoginRateLimiter } from './infrastructure/login-rate-limiter.js';
import type { RateLimitDecision } from './infrastructure/sliding-window-counter.js';
import { BcryptPasswordHasher, type PasswordHasher } from './domain/password-hasher.js';
import {
  CryptoVerificationTokenService,
  type Clock,
  type VerificationTokenService,
} from './domain/verification-token.js';
import type { AccessTokenService } from './domain/access-token.js';
import {
  buildRefreshCookieSpec,
  CryptoRefreshTokenService,
  type RefreshCookieSameSite,
  type RefreshTokenService,
} from './domain/refresh-token.js';
import type { UserRepository } from './ports/user.repository.js';
import type { EmailVerificationTokenRepository } from './ports/email-verification-token.repository.js';
import type { EmailSender } from './ports/email-sender.js';
import type { SessionRepository } from './ports/session.repository.js';

export interface IdentityRouterOptions {
  userRepository?: UserRepository | undefined;
  passwordHasher?: PasswordHasher | undefined;
  verificationTokenRepository?: EmailVerificationTokenRepository | undefined;
  verificationTokenService?: VerificationTokenService | undefined;
  emailSender?: EmailSender | undefined;
  resendRateLimiter?: ResendRateLimiter | undefined;
  sessionRepository?: SessionRepository | undefined;
  accessTokenService?: AccessTokenService | undefined;
  refreshTokenService?: RefreshTokenService | undefined;
  loginRateLimiter?: LoginRateLimiter | undefined;
  refreshTokenTtlDays?: number | undefined;
  refreshCookieSameSite?: RefreshCookieSameSite | undefined;
  isProduction?: boolean | undefined;
  appWebUrl?: string | undefined;
  emailVerificationTokenTtlMinutes?: number | undefined;
  clock?: Clock | undefined;
}

interface DualKeyRateLimiter {
  checkIp(ipKey: string): RateLimitDecision;
  checkEmail(normalizedEmail: string): RateLimitDecision;
}

function createIpRateLimitMiddleware(limiter: DualKeyRateLimiter, errorMessage: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const decision = limiter.checkIp(req.ip ?? 'unknown');
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      next(new AppError(429, 'RATE_LIMIT_EXCEEDED', errorMessage));
      return;
    }
    next();
  };
}

function createEmailRateLimitMiddleware(limiter: DualKeyRateLimiter, errorMessage: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as { email: string };
    const normalizedEmail = normalizeEmail(body.email);
    const decision = limiter.checkEmail(normalizedEmail);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      next(new AppError(429, 'RATE_LIMIT_EXCEEDED', errorMessage));
      return;
    }
    next();
  };
}

class UnconfiguredAccessTokenService implements AccessTokenService {
  async sign(): Promise<never> {
    throw new AppError(
      500,
      'AUTH_CONFIGURATION_ERROR',
      'Access token signing service is not configured.',
      false,
    );
  }

  async verify(): Promise<never> {
    throw new AppError(
      500,
      'AUTH_CONFIGURATION_ERROR',
      'Access token signing service is not configured.',
      false,
    );
  }
}

export function createIdentityRouter(options?: IdentityRouterOptions): Router {
  const router = Router();

  const clock = options?.clock ?? (() => new Date());
  const userRepository = options?.userRepository ?? new PrismaUserRepository();
  const passwordHasher = options?.passwordHasher ?? new BcryptPasswordHasher();
  const verificationTokenRepository =
    options?.verificationTokenRepository ?? new PrismaEmailVerificationTokenRepository();
  const verificationTokenService =
    options?.verificationTokenService ?? new CryptoVerificationTokenService();
  const emailSender = options?.emailSender ?? new DevelopmentEmailSender();
  const resendRateLimiter = options?.resendRateLimiter ?? new ResendRateLimiter({ clock });
  const sessionRepository = options?.sessionRepository ?? new PrismaSessionRepository();
  const accessTokenService = options?.accessTokenService ?? new UnconfiguredAccessTokenService();
  const refreshTokenService = options?.refreshTokenService ?? new CryptoRefreshTokenService();
  const loginRateLimiter = options?.loginRateLimiter ?? new LoginRateLimiter({ clock });
  const refreshTokenTtlDays = options?.refreshTokenTtlDays ?? 30;
  const refreshCookieSpec = buildRefreshCookieSpec({
    isProduction: options?.isProduction ?? false,
    sameSite: options?.refreshCookieSameSite ?? 'lax',
    refreshTokenTtlDays,
  });
  const appWebUrl = options?.appWebUrl ?? 'http://localhost:5173';
  const tokenTtlMinutes = options?.emailVerificationTokenTtlMinutes ?? 60;

  const verificationEmailIssuer = new VerificationEmailIssuer({
    tokenRepository: verificationTokenRepository,
    tokenService: verificationTokenService,
    emailSender,
    appWebUrl,
    tokenTtlMinutes,
    clock,
  });

  const registerUserUseCase = new RegisterUserUseCase(
    userRepository,
    passwordHasher,
    verificationEmailIssuer,
  );
  const verifyEmailUseCase = new VerifyEmailUseCase(
    verificationTokenRepository,
    verificationTokenService,
    clock,
  );
  const resendVerificationUseCase = new ResendVerificationUseCase(
    userRepository,
    verificationEmailIssuer,
  );
  const loginUseCase = new LoginUseCase({
    userRepository,
    sessionRepository,
    passwordHasher,
    accessTokenService,
    refreshTokenService,
    refreshTokenTtlDays,
    clock,
  });

  const controller = new IdentityController(
    registerUserUseCase,
    verifyEmailUseCase,
    resendVerificationUseCase,
    loginUseCase,
    refreshCookieSpec,
  );

  const resendRateLimitMessage = 'Too many verification email requests. Please try again later.';
  const loginRateLimitMessage = 'Too many login attempts. Please try again later.';

  router.post('/register', validateBody(registerRequestSchema), controller.register);
  router.post('/verify-email', validateBody(verifyEmailRequestSchema), controller.verifyEmail);
  router.post(
    '/resend-verification',
    createIpRateLimitMiddleware(resendRateLimiter, resendRateLimitMessage),
    validateBody(resendVerificationRequestSchema),
    createEmailRateLimitMiddleware(resendRateLimiter, resendRateLimitMessage),
    controller.resendVerification,
  );
  router.post(
    '/login',
    createIpRateLimitMiddleware(loginRateLimiter, loginRateLimitMessage),
    validateBody(loginRequestSchema),
    createEmailRateLimitMiddleware(loginRateLimiter, loginRateLimitMessage),
    controller.login,
  );

  return router;
}
