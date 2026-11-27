import type { IndividualEmployerAccountDto } from '@jmp/contracts';
import type { IndividualEmployerAccountRecord } from '../ports/employer-account.repository.js';

/**
 * Projects persisted account + profile records into a safe API DTO without ownerUserId
 * or raw Prisma internals.
 */
export function toIndividualEmployerAccountDto(
  record: IndividualEmployerAccountRecord,
): IndividualEmployerAccountDto {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    verificationStatus: record.verificationStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    profile: {
      publicName: record.profile.publicName,
      contactPhone: record.profile.contactPhone,
      countryCode: record.profile.countryCode,
      city: record.profile.city,
      updatedAt: record.profile.updatedAt.toISOString(),
    },
  };
}
