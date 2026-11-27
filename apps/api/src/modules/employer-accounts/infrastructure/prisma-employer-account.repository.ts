import { PrismaClient } from '../../../generated/prisma/client.js';
import {
  EmployerStatus,
  EmployerType,
  VerificationStatus,
} from '../../../generated/prisma/enums.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import { isUuid } from '../../authorization/index.js';
import type {
  CreateIndividualEmployerAccountInput,
  EmployerAccountRepository,
  IndividualEmployerAccountRecord,
  UpdateIndividualEmployerProfileInput,
} from '../ports/employer-account.repository.js';

const INDIVIDUAL_ACCOUNT_SELECT = {
  id: true,
  ownerUserId: true,
  type: true,
  status: true,
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
  individualProfile: {
    select: {
      publicName: true,
      contactPhone: true,
      countryCode: true,
      city: true,
      updatedAt: true,
    },
  },
} as const;

interface SelectedIndividualAccount {
  id: string;
  ownerUserId: string;
  type: EmployerType;
  status: EmployerStatus;
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
  individualProfile: {
    publicName: string;
    contactPhone: string | null;
    countryCode: string | null;
    city: string | null;
    updatedAt: Date;
  } | null;
}

function mapIndividualAccountRecord(
  row: SelectedIndividualAccount | null,
): IndividualEmployerAccountRecord | null {
  if (!row || row.type !== EmployerType.INDIVIDUAL || !row.individualProfile) {
    return null;
  }

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    type: EmployerType.INDIVIDUAL,
    status: row.status,
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    profile: {
      publicName: row.individualProfile.publicName,
      contactPhone: row.individualProfile.contactPhone,
      countryCode:
        row.individualProfile.countryCode !== null
          ? row.individualProfile.countryCode.trim()
          : null,
      city: row.individualProfile.city,
      updatedAt: row.individualProfile.updatedAt,
    },
  };
}

/**
 * Prisma-backed persistence repository for INDIVIDUAL employer accounts and profiles.
 */
export class PrismaEmployerAccountRepository implements EmployerAccountRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  async createIndividualAccount(
    input: CreateIndividualEmployerAccountInput,
  ): Promise<IndividualEmployerAccountRecord> {
    return this.client.$transaction(async (tx) => {
      const createdAccount = await tx.employerAccount.create({
        data: {
          ownerUserId: input.ownerUserId,
          type: EmployerType.INDIVIDUAL,
          status: EmployerStatus.ACTIVE,
          verificationStatus: VerificationStatus.UNVERIFIED,
        },
      });

      const createdProfile = await tx.individualEmployerProfile.create({
        data: {
          employerAccountId: createdAccount.id,
          publicName: input.publicName,
          contactPhone: input.contactPhone,
          countryCode: input.countryCode,
          city: input.city,
        },
      });

      return {
        id: createdAccount.id,
        ownerUserId: createdAccount.ownerUserId,
        type: EmployerType.INDIVIDUAL,
        status: createdAccount.status,
        verificationStatus: createdAccount.verificationStatus,
        createdAt: createdAccount.createdAt,
        updatedAt: createdAccount.updatedAt,
        profile: {
          publicName: createdProfile.publicName,
          contactPhone: createdProfile.contactPhone,
          countryCode:
            createdProfile.countryCode !== null ? createdProfile.countryCode.trim() : null,
          city: createdProfile.city,
          updatedAt: createdProfile.updatedAt,
        },
      };
    });
  }

  async findIndividualAccountById(
    employerAccountId: string,
  ): Promise<IndividualEmployerAccountRecord | null> {
    if (!isUuid(employerAccountId)) {
      return null;
    }

    const row = await this.client.employerAccount.findFirst({
      where: {
        id: employerAccountId,
        type: EmployerType.INDIVIDUAL,
      },
      select: INDIVIDUAL_ACCOUNT_SELECT,
    });

    return mapIndividualAccountRecord(row);
  }

  async updateIndividualProfile(
    input: UpdateIndividualEmployerProfileInput,
  ): Promise<IndividualEmployerAccountRecord | null> {
    if (!isUuid(input.employerAccountId)) {
      return null;
    }

    return this.client.$transaction(async (tx) => {
      const existing = await tx.employerAccount.findFirst({
        where: {
          id: input.employerAccountId,
          type: EmployerType.INDIVIDUAL,
        },
        select: {
          id: true,
          individualProfile: { select: { employerAccountId: true } },
        },
      });

      if (!existing || !existing.individualProfile) {
        return null;
      }

      const updateData: {
        publicName?: string;
        contactPhone?: string | null;
        countryCode?: string | null;
        city?: string | null;
      } = {};

      if (input.publicName !== undefined) {
        updateData.publicName = input.publicName;
      }
      if (input.contactPhone !== undefined) {
        updateData.contactPhone = input.contactPhone;
      }
      if (input.countryCode !== undefined) {
        updateData.countryCode = input.countryCode;
      }
      if (input.city !== undefined) {
        updateData.city = input.city;
      }

      await tx.individualEmployerProfile.update({
        where: { employerAccountId: input.employerAccountId },
        data: updateData,
      });

      const updated = await tx.employerAccount.findFirst({
        where: {
          id: input.employerAccountId,
          type: EmployerType.INDIVIDUAL,
        },
        select: INDIVIDUAL_ACCOUNT_SELECT,
      });

      return mapIndividualAccountRecord(updated);
    });
  }
}
