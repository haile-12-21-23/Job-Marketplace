import { AppError } from '../../../errors/app-error.js';
import {
  EmployerRole,
  EmployerStatus,
  EmployerType,
  MembershipStatus,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import type { AccessTokenService } from '../../identity/domain/access-token.js';
import type { Clock } from '../../identity/domain/verification-token.js';
import type { PrincipalSessionLookup } from '../../identity/ports/session.repository.js';
import {
  isUuid,
  type AuthenticatedPrincipal,
  type AuthorizedEmployerAccess,
} from '../domain/principal.js';
import type { EmployerAccessRepository } from '../ports/employer-access.repository.js';
import type { PermissionRepository } from '../ports/permission.repository.js';

export interface AuthorizationServiceOptions {
  accessTokenService: AccessTokenService;
  sessionRepository: PrincipalSessionLookup;
  permissionRepository: PermissionRepository;
  employerAccessRepository: EmployerAccessRepository;
  clock?: Clock | undefined;
}

export interface AssertEmployerAccessInput {
  employerAccountId: string;
  requiredAccountType?: EmployerType | undefined;
  allowedMembershipRoles?: ReadonlyArray<EmployerRole> | undefined;
  requireOwner?: boolean | undefined;
}

const BEARER_HEADER_RE = /^Bearer\s+([^\s]+)$/i;

function unauthenticatedError(): AppError {
  return new AppError(
    401,
    'AUTHENTICATION_REQUIRED',
    'Authentication is required to access this resource.',
  );
}

function insufficientPermissionsError(
  message = 'You do not have permission to perform this action.',
): AppError {
  return new AppError(403, 'INSUFFICIENT_PERMISSIONS', message);
}

function employerAccountNotFoundError(): AppError {
  return new AppError(404, 'EMPLOYER_ACCOUNT_NOT_FOUND', 'Employer account not found.');
}

function extractBearerToken(authorizationHeader: string | string[] | undefined): string {
  if (typeof authorizationHeader !== 'string') {
    throw unauthenticatedError();
  }

  const trimmed = authorizationHeader.trim();
  const match = BEARER_HEADER_RE.exec(trimmed);
  if (!match || !match[1]) {
    throw unauthenticatedError();
  }

  return match[1];
}

/**
 * Centralized server-side authentication, persisted platform RBAC permission evaluation,
 * and tenant employer-account ownership/membership enforcement.
 */
export class AuthorizationService {
  private readonly accessTokenService: AccessTokenService;
  private readonly sessionRepository: PrincipalSessionLookup;
  private readonly permissionRepository: PermissionRepository;
  private readonly employerAccessRepository: EmployerAccessRepository;
  private readonly clock: Clock;

  constructor(options: AuthorizationServiceOptions) {
    this.accessTokenService = options.accessTokenService;
    this.sessionRepository = options.sessionRepository;
    this.permissionRepository = options.permissionRepository;
    this.employerAccessRepository = options.employerAccessRepository;
    this.clock = options.clock ?? (() => new Date());
  }

  /**
   * Verifies Authorization: Bearer <jwt>, validates required claims, and verifies that the
   * referenced UserSession row is live in PostgreSQL for an active, email-verified user.
   */
  async authenticateBearerHeader(
    authorizationHeader: string | string[] | undefined,
  ): Promise<AuthenticatedPrincipal> {
    const token = extractBearerToken(authorizationHeader);
    const now = this.clock();

    let claims;
    try {
      claims = await this.accessTokenService.verify(token, now);
    } catch {
      throw unauthenticatedError();
    }

    if (!isUuid(claims.sub) || !isUuid(claims.sid)) {
      throw unauthenticatedError();
    }

    const candidate = await this.sessionRepository.findSessionCandidateByIdAndUserId(
      claims.sid,
      claims.sub,
    );

    if (
      !candidate ||
      candidate.session.id !== claims.sid ||
      candidate.session.userId !== claims.sub ||
      candidate.session.revokedAt !== null ||
      candidate.session.expiresAt.getTime() <= now.getTime() ||
      candidate.user.status !== UserStatus.ACTIVE ||
      candidate.user.emailVerifiedAt === null
    ) {
      throw unauthenticatedError();
    }

    return {
      userId: candidate.user.id,
      sessionId: candidate.session.id,
    };
  }

  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    return this.permissionRepository.hasUserPermission(userId, permissionCode);
  }

  async listUserPermissions(userId: string): Promise<string[]> {
    return this.permissionRepository.listUserPermissionCodes(userId);
  }

  async assertPermission(
    principal: AuthenticatedPrincipal | undefined,
    permissionCode: string,
  ): Promise<void> {
    if (!principal || !isUuid(principal.userId)) {
      throw unauthenticatedError();
    }

    const allowed = await this.permissionRepository.hasUserPermission(
      principal.userId,
      permissionCode,
    );
    if (!allowed) {
      throw insufficientPermissionsError();
    }
  }

  /**
   * Authorizes tenant access against persisted EmployerAccount.ownerUserId and EmployerMembership.
   * Returns 404 for nonexistent, inactive, or non-member/non-active-member callers to avoid
   * leaking tenant existence, and 403 when an active member lacks the required tenant role.
   */
  async assertEmployerAccess(
    principal: AuthenticatedPrincipal | undefined,
    input: AssertEmployerAccessInput,
  ): Promise<AuthorizedEmployerAccess> {
    if (!principal || !isUuid(principal.userId)) {
      throw unauthenticatedError();
    }

    const account = await this.employerAccessRepository.findAccountAccessForUser(
      input.employerAccountId,
      principal.userId,
    );

    if (
      !account ||
      account.accountStatus !== EmployerStatus.ACTIVE ||
      (input.requiredAccountType !== undefined && account.accountType !== input.requiredAccountType)
    ) {
      throw employerAccountNotFoundError();
    }

    if (account.ownerUserId === principal.userId) {
      return {
        employerAccountId: account.employerAccountId,
        accountType: account.accountType,
        accessType: 'owner',
        role: EmployerRole.OWNER,
        userId: principal.userId,
      };
    }

    if (!account.membership || account.membership.status !== MembershipStatus.ACTIVE) {
      throw employerAccountNotFoundError();
    }

    if (input.requireOwner === true) {
      throw insufficientPermissionsError(
        'Only the employer account owner can perform this action.',
      );
    }

    if (
      input.allowedMembershipRoles !== undefined &&
      !input.allowedMembershipRoles.includes(account.membership.role)
    ) {
      throw insufficientPermissionsError(
        'You do not have permission to perform this action for this employer account.',
      );
    }

    return {
      employerAccountId: account.employerAccountId,
      accountType: account.accountType,
      accessType: 'member',
      role: account.membership.role,
      userId: principal.userId,
    };
  }
}
