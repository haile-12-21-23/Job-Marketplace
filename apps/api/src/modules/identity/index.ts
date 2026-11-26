export { createIdentityRouter, type IdentityRouterOptions } from './identity.routes.js';
export { IdentityController } from './identity.controller.js';
export { RegisterUserUseCase } from './application/register-user.use-case.js';
export { VerifyEmailUseCase } from './application/verify-email.use-case.js';
export { ResendVerificationUseCase } from './application/resend-verification.use-case.js';
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
  type UserRepository,
  type CreateUserInput,
  type UserRecord,
} from './ports/user.repository.js';
export {
  type EmailVerificationTokenRepository,
  type EmailVerificationTokenRecord,
  type IssueVerificationTokenInput,
  type ConsumeVerificationTokenOutcome,
} from './ports/email-verification-token.repository.js';
export { type EmailSender, type VerificationEmailPayload } from './ports/email-sender.js';
export { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
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
  ResendRateLimiter,
  type RateLimitDecision,
  type ResendRateLimiterOptions,
} from './infrastructure/resend-rate-limiter.js';
