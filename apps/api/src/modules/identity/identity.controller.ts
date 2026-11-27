import type { Request, Response, NextFunction } from 'express';
import type {
  ConfirmPasswordResetRequest,
  LoginRequest,
  RegisterRequest,
  RequestPasswordResetRequest,
  ResendVerificationRequest,
  VerifyEmailRequest,
} from '@jmp/contracts';
import type { RegisterUserUseCase } from './application/register-user.use-case.js';
import type { VerifyEmailUseCase } from './application/verify-email.use-case.js';
import type { ResendVerificationUseCase } from './application/resend-verification.use-case.js';
import type { LoginUseCase } from './application/login.use-case.js';
import type { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import type { LogoutSessionUseCase } from './application/logout-session.use-case.js';
import type { RequestPasswordResetUseCase } from './application/request-password-reset.use-case.js';
import type { ConfirmPasswordResetUseCase } from './application/confirm-password-reset.use-case.js';
import { extractRefreshCookieToken, type RefreshCookieSpec } from './domain/refresh-token.js';

export class IdentityController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutSessionUseCase: LogoutSessionUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly confirmPasswordResetUseCase: ConfirmPasswordResetUseCase,
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

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });

      const parsedCookie = extractRefreshCookieToken(
        req.headers.cookie,
        this.refreshCookieSpec.name,
      );
      const rawRefreshToken = parsedCookie.status === 'present' ? parsedCookie.token : null;

      const result = await this.refreshSessionUseCase.execute(rawRefreshToken);

      res
        .cookie(this.refreshCookieSpec.name, result.refreshToken, this.refreshCookieSpec.options)
        .status(200)
        .json({ data: result.response });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });

      const parsedCookie = extractRefreshCookieToken(
        req.headers.cookie,
        this.refreshCookieSpec.name,
      );
      const rawRefreshToken = parsedCookie.status === 'present' ? parsedCookie.token : null;

      const result = await this.logoutSessionUseCase.execute(rawRefreshToken);

      res
        .clearCookie(this.refreshCookieSpec.name, this.refreshCookieSpec.clearOptions)
        .status(200)
        .json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  requestPasswordReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });

      const result = await this.requestPasswordResetUseCase.execute(
        req.body as RequestPasswordResetRequest,
      );

      res.status(202).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  confirmPasswordReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });

      const result = await this.confirmPasswordResetUseCase.execute(
        req.body as ConfirmPasswordResetRequest,
      );

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
