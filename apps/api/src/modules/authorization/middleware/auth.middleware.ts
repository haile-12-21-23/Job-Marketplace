import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { EmployerRole } from '../../../generated/prisma/enums.js';
import type { AuthorizationService } from '../application/authorization.service.js';
import type { PlatformPermissionCode } from '../authorization.catalogue.js';

export interface EmployerAccessGuardOptions {
  paramName?: string | undefined;
  resolveEmployerAccountId?: ((req: Request) => string | undefined) | undefined;
  allowedMembershipRoles?: ReadonlyArray<EmployerRole> | undefined;
  requireOwner?: boolean | undefined;
}

export interface AuthorizationGuards {
  authenticate: RequestHandler;
  requirePermission: (permissionCode: PlatformPermissionCode | string) => RequestHandler;
  requireEmployerAccess: (options?: EmployerAccessGuardOptions) => RequestHandler;
}

/**
 * Builds Express middleware guards backed by the injected AuthorizationService.
 */
export function createAuthorizationGuards(
  authorizationService: AuthorizationService,
): AuthorizationGuards {
  const authenticate: RequestHandler = async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      req.auth = await authorizationService.authenticateBearerHeader(req.headers.authorization);
      next();
    } catch (err) {
      next(err);
    }
  };

  const requirePermission = (permissionCode: PlatformPermissionCode | string): RequestHandler => {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      try {
        await authorizationService.assertPermission(req.auth, permissionCode);
        next();
      } catch (err) {
        next(err);
      }
    };
  };

  const requireEmployerAccess = (options?: EmployerAccessGuardOptions): RequestHandler => {
    const paramName = options?.paramName ?? 'employerAccountId';

    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawAccountId = options?.resolveEmployerAccountId
          ? options.resolveEmployerAccountId(req)
          : req.params[paramName];

        const employerAccountId = typeof rawAccountId === 'string' ? rawAccountId.trim() : '';

        req.employerAccess = await authorizationService.assertEmployerAccess(req.auth, {
          employerAccountId,
          allowedMembershipRoles: options?.allowedMembershipRoles,
          requireOwner: options?.requireOwner,
        });
        next();
      } catch (err) {
        next(err);
      }
    };
  };

  return {
    authenticate,
    requirePermission,
    requireEmployerAccess,
  };
}
