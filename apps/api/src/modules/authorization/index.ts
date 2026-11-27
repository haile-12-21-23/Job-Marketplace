import { AppError } from '../../errors/app-error.js';
import type { AccessTokenService } from '../identity/domain/access-token.js';
import type { Clock } from '../identity/domain/verification-token.js';
import { PrismaSessionRepository } from '../identity/infrastructure/prisma-session.repository.js';
import type { PrincipalSessionLookup } from '../identity/ports/session.repository.js';
import {
  AuthorizationService,
  type AssertEmployerAccessInput,
  type AuthorizationServiceOptions,
} from './application/authorization.service.js';
import {
  INITIAL_PERMISSIONS,
  INITIAL_PLATFORM_ROLES,
  INITIAL_ROLE_PERMISSION_MAP,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_CODES,
  type PermissionSeedEntry,
  type PlatformPermissionCode,
  type PlatformRoleCode,
  type PlatformRoleSeedEntry,
} from './authorization.catalogue.js';
import {
  isUuid,
  type AuthenticatedPrincipal,
  type AuthorizedEmployerAccess,
} from './domain/principal.js';
import { PrismaEmployerAccessRepository } from './infrastructure/prisma-employer-access.repository.js';
import { PrismaPermissionRepository } from './infrastructure/prisma-permission.repository.js';
import {
  createAuthorizationGuards,
  type AuthorizationGuards,
  type EmployerAccessGuardOptions,
} from './middleware/auth.middleware.js';
import type {
  EmployerAccessRepository,
  EmployerAccountAccessRecord,
  EmployerMembershipSummary,
} from './ports/employer-access.repository.js';
import type { PermissionRepository } from './ports/permission.repository.js';
import { seedPlatformRbac, type SeedPlatformRbacResult } from './seed-platform-rbac.js';

export interface AuthorizationOptions {
  accessTokenService?: AccessTokenService | undefined;
  sessionRepository?: PrincipalSessionLookup | undefined;
  permissionRepository?: PermissionRepository | undefined;
  employerAccessRepository?: EmployerAccessRepository | undefined;
  clock?: Clock | undefined;
}

export interface AuthorizationContext {
  service: AuthorizationService;
  guards: AuthorizationGuards;
}

class UnconfiguredAccessTokenVerifier implements AccessTokenService {
  async sign(): Promise<never> {
    throw new AppError(
      500,
      'AUTH_CONFIGURATION_ERROR',
      'Access token verification service is not configured.',
      false,
    );
  }

  async verify(): Promise<never> {
    throw new AppError(
      500,
      'AUTH_CONFIGURATION_ERROR',
      'Access token verification service is not configured.',
      false,
    );
  }
}

/**
 * Pure factory composing the AuthorizationService and Express guards without eagerly
 * loading environment variables or establishing database connections.
 */
export function createAuthorizationContext(options?: AuthorizationOptions): AuthorizationContext {
  const service = new AuthorizationService({
    accessTokenService: options?.accessTokenService ?? new UnconfiguredAccessTokenVerifier(),
    sessionRepository: options?.sessionRepository ?? new PrismaSessionRepository(),
    permissionRepository: options?.permissionRepository ?? new PrismaPermissionRepository(),
    employerAccessRepository:
      options?.employerAccessRepository ?? new PrismaEmployerAccessRepository(),
    clock: options?.clock,
  });

  return {
    service,
    guards: createAuthorizationGuards(service),
  };
}

export {
  AuthorizationService,
  type AuthorizationServiceOptions,
  type AssertEmployerAccessInput,
  createAuthorizationGuards,
  type AuthorizationGuards,
  type EmployerAccessGuardOptions,
  PrismaPermissionRepository,
  PrismaEmployerAccessRepository,
  type PermissionRepository,
  type EmployerAccessRepository,
  type EmployerAccountAccessRecord,
  type EmployerMembershipSummary,
  isUuid,
  type AuthenticatedPrincipal,
  type AuthorizedEmployerAccess,
  PLATFORM_ROLE_CODES,
  PLATFORM_PERMISSIONS,
  INITIAL_PLATFORM_ROLES,
  INITIAL_PERMISSIONS,
  INITIAL_ROLE_PERMISSION_MAP,
  type PlatformRoleCode,
  type PlatformPermissionCode,
  type PlatformRoleSeedEntry,
  type PermissionSeedEntry,
  seedPlatformRbac,
  type SeedPlatformRbacResult,
};
