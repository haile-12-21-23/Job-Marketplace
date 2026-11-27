import type { Request, Response, NextFunction } from 'express';
import type {
  LoginRequest,
  RegisterRequest,
  ResendVerificationRequest,
  VerifyEmailRequest,
} from '@jmp/contracts';
import type { RegisterUserUseCase } from './application/register-user.use-case.js';
import type { VerifyEmailUseCase } from './application/verify-email.use-case.js';
import type { ResendVerificationUseCase } from './application/resend-verification.use-case.js';
import type { LoginUseCase } from './application/login.use-case.js';
import type { RefreshCookieSpec } from './domain/refresh-token.js';

export class IdentityController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshCookieSpec: RefreshCookieSpec,
  ) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.registerUserUseCase.execute(req.body as RegisterRequest);

      res.status(201).location(`/api/v1/users/${result.id}`).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.verifyEmailUseCase.execute(req.body as VerifyEmailRequest);

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.resendVerificationUseCase.execute(
        req.body as ResendVerificationRequest,
      );

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.loginUseCase.execute(req.body as LoginRequest);

      res
        .set({
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        })
        .cookie(this.refreshCookieSpec.name, result.refreshToken, this.refreshCookieSpec.options)
        .status(200)
        .json({ data: result.response });
    } catch (err) {
      next(err);
    }
  };
}
