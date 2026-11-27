import { Router } from 'express';
import {
  createIndividualEmployerAccountRequestSchema,
  updateIndividualEmployerProfileRequestSchema,
} from '@jmp/contracts';
import { validateBody } from '../../middleware/validate.js';
import { EmployerType } from '../../generated/prisma/enums.js';
import { createAuthorizationContext, type AuthorizationContext } from '../authorization/index.js';
import { CreateIndividualEmployerAccountUseCase } from './application/create-individual-employer-account.use-case.js';
import { GetIndividualEmployerAccountUseCase } from './application/get-individual-employer-account.use-case.js';
import { UpdateIndividualEmployerProfileUseCase } from './application/update-individual-employer-profile.use-case.js';
import { EmployerAccountsController } from './employer-accounts.controller.js';
import { PrismaEmployerAccountRepository } from './infrastructure/prisma-employer-account.repository.js';
import type { EmployerAccountRepository } from './ports/employer-account.repository.js';

export interface EmployerAccountsRouterOptions {
  authorization?: AuthorizationContext | undefined;
  employerAccountRepository?: EmployerAccountRepository | undefined;
}

export function createEmployerAccountsRouter(options?: EmployerAccountsRouterOptions): Router {
  const router = Router();
  const authorization = options?.authorization ?? createAuthorizationContext();
  const employerAccountRepository =
    options?.employerAccountRepository ?? new PrismaEmployerAccountRepository();

  const createUseCase = new CreateIndividualEmployerAccountUseCase(employerAccountRepository);
  const getUseCase = new GetIndividualEmployerAccountUseCase(employerAccountRepository);
  const updateProfileUseCase = new UpdateIndividualEmployerProfileUseCase(
    employerAccountRepository,
  );

  const controller = new EmployerAccountsController(
    createUseCase,
    getUseCase,
    updateProfileUseCase,
  );

  router.post(
    '/',
    authorization.guards.authenticate,
    validateBody(createIndividualEmployerAccountRequestSchema),
    controller.create,
  );

  router.get(
    '/:employerAccountId',
    authorization.guards.authenticate,
    authorization.guards.requireEmployerAccess({
      requiredAccountType: EmployerType.INDIVIDUAL,
    }),
    controller.getById,
  );

  router.patch(
    '/:employerAccountId',
    authorization.guards.authenticate,
    authorization.guards.requireEmployerAccess({
      requiredAccountType: EmployerType.INDIVIDUAL,
      requireOwner: true,
    }),
    validateBody(updateIndividualEmployerProfileRequestSchema),
    controller.updateProfile,
  );

  return router;
}
