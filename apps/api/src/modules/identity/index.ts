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
  RequestPasswordResetUseCase,
  GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
  type RequestPasswordResetUseCaseOptions,
} from './application/request-password-reset.use-case.js';
export {
  ConfirmPasswordResetUseCase,
  type ConfirmPasswordResetUseCaseOptions,
} from './application/confirm-password-reset.use-case.js';
export {
  PasswordResetOutboxDispatcher,
  sanitizePasswordResetDispatchError,
  type OutboxWorkNotifier,
  type PasswordResetOutboxDispatcherOptions,
} from './application/password-reset-outbox-dispatcher.js';
export { OutboxPayloadCipher, type SealedOutboxPayload } from './domain/outbox-payload-cipher.js';
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
  type CreateAuthenticatedSessionInput,
  type CreateAuthenticatedSessionResult,
  type ReplayCheckResult,
  type RevokeFamilyResult,
  type RotateSessionInput,
  type RotateSessionResult,
  type SessionRotationCandidate,
  type SessionUserEligibility,
  type UserSessionRecord,
  type PrincipalSessionLookup,
} from './ports/session.repository.js';
export {
  type PasswordResetTokenRepository,
  type PasswordResetTokenRecord,
  type IssuePasswordResetTokenInput,
  type IssuePasswordResetTokenWithOutboxInput,
  type EnqueuePasswordResetOutboxEventInput,
  type ConsumePasswordResetTokenInput,
  type ConsumePasswordResetTokenOutcome,
} from './ports/password-reset-token.repository.js';
export {
  PASSWORD_RESET_EMAIL_OUTBOX_EVENT_TYPE,
  type PasswordResetOutboxRepository,
  type PasswordResetOutboxRecord,
  type MarkPasswordResetOutboxRetryInput,
} from './ports/password-reset-outbox.repository.js';
export {
  type EmailVerificationTokenRepository,
  type EmailVerificationTokenRecord,
  type IssueVerificationTokenInput,
  type ConsumeVerificationTokenOutcome,
} from './ports/email-verification-token.repository.js';
export {
  type EmailSender,
  type VerificationEmailPayload,
  type PasswordResetEmailPayload,
} from './ports/email-sender.js';
export { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
export { PrismaSessionRepository } from './infrastructure/prisma-session.repository.js';
export { PrismaEmailVerificationTokenRepository } from './infrastructure/prisma-email-verification-token.repository.js';
export { PrismaPasswordResetTokenRepository } from './infrastructure/prisma-password-reset-token.repository.js';
export { PrismaPasswordResetOutboxRepository } from './infrastructure/prisma-password-reset-outbox.repository.js';
export {
  DevelopmentEmailSender,
  HttpEmailSender,
  buildVerificationEmailContent,
  buildPasswordResetEmailContent,
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
export {
  PasswordResetRateLimiter,
  type PasswordResetRateLimiterOptions,
} from './infrastructure/password-reset-rate-limiter.js';
