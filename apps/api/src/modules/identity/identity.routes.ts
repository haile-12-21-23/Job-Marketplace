import { Router } from 'express';
import { registerRequestSchema } from '@jmp/contracts';
import { validateBody } from '../../middleware/validate.js';
import { IdentityController } from './identity.controller.js';
import { RegisterUserUseCase } from './application/register-user.use-case.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { BcryptPasswordHasher } from './domain/password-hasher.js';
import type { UserRepository } from './ports/user.repository.js';
import type { PasswordHasher } from './domain/password-hasher.js';

export interface IdentityRouterOptions {
  userRepository?: UserRepository | undefined;
  passwordHasher?: PasswordHasher | undefined;
}

export function createIdentityRouter(options?: IdentityRouterOptions): Router {
  const router = Router();

  const userRepository = options?.userRepository ?? new PrismaUserRepository();
  const passwordHasher = options?.passwordHasher ?? new BcryptPasswordHasher();
  const registerUserUseCase = new RegisterUserUseCase(userRepository, passwordHasher);
  const controller = new IdentityController(registerUserUseCase);

  router.post('/register', validateBody(registerRequestSchema), controller.register);

  return router;
}
