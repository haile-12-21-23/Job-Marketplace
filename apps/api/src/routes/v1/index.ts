import { Router } from 'express';
import { API_VERSION } from '@jmp/contracts';
import type { Request, Response } from 'express';
import {
  createAuthorizationContext,
  type AuthorizationContext,
  type AuthorizationOptions,
} from '../../modules/authorization/index.js';
import {
  createEmployerAccountsRouter,
  type EmployerAccountsRouterOptions,
} from '../../modules/employer-accounts/index.js';
import { createIdentityRouter, type IdentityRouterOptions } from '../../modules/identity/index.js';

export interface V1RouterOptions {
  corsOrigins?: ReadonlyArray<string> | undefined;
  identity?: IdentityRouterOptions | undefined;
  authorization?: AuthorizationOptions | undefined;
  employerAccounts?: Omit<EmployerAccountsRouterOptions, 'authorization'> | undefined;
  onMountRoutes?: ((router: Router, authorization: AuthorizationContext) => void) | undefined;
}

export function createV1Router(options?: V1RouterOptions): Router {
  const router: Router = Router();

  /**
   * GET /api/v1
   * Informational endpoint: confirms the API process and router are running.
   * Returns the standard success envelope { data: { ... } }.
   */
  router.get('/', (_req: Request, res: Response): void => {
    res.json({
      data: {
        service: 'Job Marketplace API',
        version: API_VERSION,
        status: 'ok',
      },
    });
  });

  const authorization = createAuthorizationContext({
    accessTokenService:
      options?.authorization?.accessTokenService ?? options?.identity?.accessTokenService,
    sessionRepository:
      options?.authorization?.sessionRepository ?? options?.identity?.sessionRepository,
    permissionRepository: options?.authorization?.permissionRepository,
    employerAccessRepository: options?.authorization?.employerAccessRepository,
    clock: options?.authorization?.clock ?? options?.identity?.clock,
  });

  /**
   * Public and session-cookie identity endpoints under /auth.
   * Bearer auth middleware is NOT applied globally here so login, registration, verification,
   * password reset, refresh, and logout preserve their existing boundaries.
   */
  const identityOptions: IdentityRouterOptions | undefined =
    options?.identity || options?.corsOrigins
      ? {
          ...options?.identity,
          allowedOrigins: options?.identity?.allowedOrigins ?? options?.corsOrigins,
        }
      : undefined;

  router.use('/auth', createIdentityRouter(identityOptions));

  router.use(
    '/employer-accounts',
    createEmployerAccountsRouter({
      authorization,
      employerAccountRepository: options?.employerAccounts?.employerAccountRepository,
    }),
  );

  if (options?.onMountRoutes) {
    options.onMountRoutes(router, authorization);
  }

  return router;
}

const v1Router: Router = createV1Router();

export { v1Router };
