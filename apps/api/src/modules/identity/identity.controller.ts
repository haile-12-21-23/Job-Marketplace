import type { Request, Response, NextFunction } from 'express';
import type {
  RegisterRequest,
  ResendVerificationRequest,
  VerifyEmailRequest,
} from '@jmp/contracts';
import type { RegisterUserUseCase } from './application/register-user.use-case.js';
import type { VerifyEmailUseCase } from './application/verify-email.use-case.js';
import type { ResendVerificationUseCase } from './application/resend-verification.use-case.js';

export class IdentityController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
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
}
