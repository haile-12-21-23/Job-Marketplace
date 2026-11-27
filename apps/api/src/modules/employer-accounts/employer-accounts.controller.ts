import type { NextFunction, Request, Response } from 'express';
import type {
  CreateIndividualEmployerAccountRequest,
  UpdateIndividualEmployerProfileRequest,
} from '@jmp/contracts';
import { AppError } from '../../errors/app-error.js';
import type { CreateIndividualEmployerAccountUseCase } from './application/create-individual-employer-account.use-case.js';
import type { GetIndividualEmployerAccountUseCase } from './application/get-individual-employer-account.use-case.js';
import type { UpdateIndividualEmployerProfileUseCase } from './application/update-individual-employer-profile.use-case.js';

export class EmployerAccountsController {
  constructor(
    private readonly createUseCase: CreateIndividualEmployerAccountUseCase,
    private readonly getUseCase: GetIndividualEmployerAccountUseCase,
    private readonly updateProfileUseCase: UpdateIndividualEmployerProfileUseCase,
  ) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required to access this resource.',
        );
      }

      const result = await this.createUseCase.execute(
        req.auth.userId,
        req.body as CreateIndividualEmployerAccountRequest,
      );

      res.status(201).location(`/api/v1/employer-accounts/${result.id}`).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = req.employerAccess?.employerAccountId;
      if (!accountId) {
        throw new AppError(404, 'EMPLOYER_ACCOUNT_NOT_FOUND', 'Employer account not found.');
      }

      const result = await this.getUseCase.execute(accountId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = req.employerAccess?.employerAccountId;
      if (!accountId) {
        throw new AppError(404, 'EMPLOYER_ACCOUNT_NOT_FOUND', 'Employer account not found.');
      }

      const result = await this.updateProfileUseCase.execute(
        accountId,
        req.body as UpdateIndividualEmployerProfileRequest,
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
