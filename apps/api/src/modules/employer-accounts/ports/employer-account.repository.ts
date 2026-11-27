import type {
  EmployerStatus,
  EmployerType,
  VerificationStatus,
} from '../../../generated/prisma/enums.js';

export interface IndividualEmployerProfileRecord {
  readonly publicName: string;
  readonly contactPhone: string | null;
  readonly countryCode: string | null;
  readonly city: string | null;
  readonly updatedAt: Date;
}

export interface IndividualEmployerAccountRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly type: typeof EmployerType.INDIVIDUAL;
  readonly status: EmployerStatus;
  readonly verificationStatus: VerificationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly profile: IndividualEmployerProfileRecord;
}

export interface CreateIndividualEmployerAccountInput {
  ownerUserId: string;
  publicName: string;
  contactPhone: string | null;
  countryCode: string | null;
  city: string | null;
}

export interface UpdateIndividualEmployerProfileInput {
  employerAccountId: string;
  publicName?: string | undefined;
  contactPhone?: string | null | undefined;
  countryCode?: string | null | undefined;
  city?: string | null | undefined;
}

export interface EmployerAccountRepository {
  createIndividualAccount(
    input: CreateIndividualEmployerAccountInput,
  ): Promise<IndividualEmployerAccountRecord>;
  findIndividualAccountById(
    employerAccountId: string,
  ): Promise<IndividualEmployerAccountRecord | null>;
  updateIndividualProfile(
    input: UpdateIndividualEmployerProfileInput,
  ): Promise<IndividualEmployerAccountRecord | null>;
}
