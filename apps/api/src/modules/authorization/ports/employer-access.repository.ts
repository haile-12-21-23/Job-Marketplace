import type {
  EmployerRole,
  EmployerStatus,
  EmployerType,
  MembershipStatus,
} from '../../../generated/prisma/enums.js';

export interface EmployerMembershipSummary {
  readonly id: string;
  readonly role: EmployerRole;
  readonly status: MembershipStatus;
}

export interface EmployerAccountAccessRecord {
  readonly employerAccountId: string;
  readonly ownerUserId: string;
  readonly accountStatus: EmployerStatus;
  readonly accountType: EmployerType;
  readonly membership: EmployerMembershipSummary | null;
}

export interface EmployerAccessRepository {
  findAccountAccessForUser(
    employerAccountId: string,
    userId: string,
  ): Promise<EmployerAccountAccessRecord | null>;
}
