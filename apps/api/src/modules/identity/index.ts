export { createIdentityRouter, type IdentityRouterOptions } from './identity.routes.js';
export { IdentityController } from './identity.controller.js';
export { RegisterUserUseCase } from './application/register-user.use-case.js';
export { VerifyEmailUseCase } from './application/verify-email.use-case.js';
export { ResendVerificationUseCase } from './application/resend-verification.use-case.js';
export {
  LoginUseCase,
  type LoginUseCaseOptions,
  type LoginUseCaseResult,
} from './application/login.use-case.js';
export {
  RefreshSessionUseCase,
  type RefreshSessionUseCaseOptions,
  type RefreshSessionUseCaseResult,
} from './application/refresh-session.use-case.js';
export {
  LogoutSessionUseCase,
  type LogoutSessionUseCaseOptions,
} from './application/logout-session.use-case.js';
export {
  VerificationEmailIssuer,
  type IssueVerificationEmailInput,
  type VerificationEmailIssuerOptions,
} from './application/verification-email-issuer.js';
export { BcryptPasswordHasher, type PasswordHasher } from './domain/password-hasher.js';
export {
  CryptoVerificationTokenService,
  type VerificationTokenService,
  type Clock,
} from './domain/verification-token.js';
export {
  JoseAccessTokenService,
  type AccessTokenClaims,
  type AccessTokenService,
  type JoseAccessTokenServiceOptions,
  type SignAccessTokenInput,
  type SignedAccessToken,
} from './domain/access-token.js';
export {
  CryptoRefreshTokenService,
  buildRefreshCookieSpec,
  extractRefreshCookieToken,
  type RefreshCookieConfigInput,
  type RefreshCookieParseResult,
  type RefreshCookieSameSite,
  type RefreshCookieSpec,
  type RefreshTokenService,
} from './domain/refresh-token.js';
export {
  type UserRepository,
  type CreateUserInput,
  type UserRecord,
  type UserCredentialRecord,
} from './ports/user.repository.js';
export {
  type SessionRepository,
  type CreateSessionInput,
  type ReplayCheckResult,
  type RevokeFamilyResult,
  type RotateSessionInput,
  type RotateSessionResult,
  type SessionRotationCandidate,
  type SessionUserEligibility,
  type UserSessionRecord,
} from './ports/session.repository.js';
export {
  type EmailVerificationTokenRepository,
  type EmailVerificationTokenRecord,
  type IssueVerificationTokenInput,
  type ConsumeVerificationTokenOutcome,
} from './ports/email-verification-token.repository.js';
export { type EmailSender, type VerificationEmailPayload } from './ports/email-sender.js';
export { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
export { PrismaSessionRepository } from './infrastructure/prisma-session.repository.js';
export { PrismaEmailVerificationTokenRepository } from './infrastructure/prisma-email-verification-token.repository.js';
export {
  DevelopmentEmailSender,
  HttpEmailSender,
  buildVerificationEmailContent,
  createEmailSender,
  type EmailSenderConfig,
  type HttpEmailSenderOptions,
  type RenderedEmailContent,
} from './infrastructure/email-sender.js';
export {
  SlidingWindowCounter,
  type RateLimitDecision,
} from './infrastructure/sliding-window-counter.js';
export {
  ResendRateLimiter,
  type ResendRateLimiterOptions,
} from './infrastructure/resend-rate-limiter.js';
export {
  LoginRateLimiter,
  type LoginRateLimiterOptions,
} from './infrastructure/login-rate-limiter.js';
