import type { EmployerRole, EmployerType } from '../../../generated/prisma/enums.js';

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
}

export interface AuthorizedEmployerAccess {
  readonly employerAccountId: string;
  readonly accountType: EmployerType;
  readonly accessType: 'owner' | 'member';
  readonly role: EmployerRole;
  readonly userId: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}
