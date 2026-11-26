import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  normalizeEmail,
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  type ResendVerificationRequest,
} from '@jmp/contracts';
import { AppError } from '../../errors/app-error.js';
import { validateBody } from '../../middleware/validate.js';
import { IdentityController } from './identity.controller.js';
import { RegisterUserUseCase } from './application/register-user.use-case.js';
import { VerifyEmailUseCase } from './application/verify-email.use-case.js';
import { ResendVerificationUseCase } from './application/resend-verification.use-case.js';
import { VerificationEmailIssuer } from './application/verification-email-issuer.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { PrismaEmailVerificationTokenRepository } from './infrastructure/prisma-email-verification-token.repository.js';
import { DevelopmentEmailSender } from './infrastructure/email-sender.js';
import { ResendRateLimiter } from './infrastructure/resend-rate-limiter.js';
import { BcryptPasswordHasher, type PasswordHasher } from './domain/password-hasher.js';
import {
  CryptoVerificationTokenService,
  type Clock,
  type VerificationTokenService,
} from './domain/verification-token.js';
import type { UserRepository } from './ports/user.repository.js';
import type { EmailVerificationTokenRepository } from './ports/email-verification-token.repository.js';
import type { EmailSender } from './ports/email-sender.js';

export interface IdentityRouterOptions {
  userRepository?: UserRepository | undefined;
  passwordHasher?: PasswordHasher | undefined;
  verificationTokenRepository?: EmailVerificationTokenRepository | undefined;
  verificationTokenService?: VerificationTokenService | undefined;
  emailSender?: EmailSender | undefined;
  resendRateLimiter?: ResendRateLimiter | undefined;
  appWebUrl?: string | undefined;
  emailVerificationTokenTtlMinutes?: number | undefined;
  clock?: Clock | undefined;
}

function createResendIpRateLimitMiddleware(limiter: ResendRateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const decision = limiter.checkIp(req.ip ?? 'unknown');
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      next(
        new AppError(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Too many verification email requests. Please try again later.',
        ),
      );
      return;
    }
    next();
  };
}

function createResendEmailRateLimitMiddleware(limiter: ResendRateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as ResendVerificationRequest;
    const normalizedEmail = normalizeEmail(body.email);
    const decision = limiter.checkEmail(normalizedEmail);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      next(
        new AppError(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Too many verification email requests. Please try again later.',
        ),
      );
      return;
    }
    next();
  };
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

  const controller = new IdentityController(
    registerUserUseCase,
    verifyEmailUseCase,
    resendVerificationUseCase,
  );

  router.post('/register', validateBody(registerRequestSchema), controller.register);
  router.post('/verify-email', validateBody(verifyEmailRequestSchema), controller.verifyEmail);
  router.post(
    '/resend-verification',
    createResendIpRateLimitMiddleware(resendRateLimiter),
    validateBody(resendVerificationRequestSchema),
    createResendEmailRateLimitMiddleware(resendRateLimiter),
    controller.resendVerification,
  );

  return router;
}
