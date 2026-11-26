export { createIdentityRouter, type IdentityRouterOptions } from './identity.routes.js';
export { IdentityController } from './identity.controller.js';
export { RegisterUserUseCase } from './application/register-user.use-case.js';
export { BcryptPasswordHasher, type PasswordHasher } from './domain/password-hasher.js';
export {
  type UserRepository,
  type CreateUserInput,
  type UserRecord,
} from './ports/user.repository.js';
export { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
