import type { Request, Response, NextFunction } from 'express';
import type { RegisterRequest } from '@jmp/contracts';
import { RegisterUserUseCase } from './application/register-user.use-case.js';

export class IdentityController {
  constructor(private readonly registerUserUseCase: RegisterUserUseCase) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.registerUserUseCase.execute(req.body as RegisterRequest);

      res.status(201).location(`/api/v1/users/${result.id}`).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
