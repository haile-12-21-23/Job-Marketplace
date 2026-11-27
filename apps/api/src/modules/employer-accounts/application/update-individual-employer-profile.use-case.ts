import type {
  IndividualEmployerAccountDto,
  UpdateIndividualEmployerProfileRequest,
} from '@jmp/contracts';
import { AppError } from '../../../errors/app-error.js';
import { toIndividualEmployerAccountDto } from '../domain/individual-employer-account.mapper.js';
import type { EmployerAccountRepository } from '../ports/employer-account.repository.js';

export class UpdateIndividualEmployerProfileUseCase {
  constructor(private readonly employerAccountRepository: EmployerAccountRepository) {}

  async execute(
    employerAccountId: string,
    input: UpdateIndividualEmployerProfileRequest,
  ): Promise<IndividualEmployerAccountDto> {
    const updated = await this.employerAccountRepository.updateIndividualProfile({
      employerAccountId,
      ...(input.publicName !== undefined ? { publicName: input.publicName } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
    });

    if (!updated) {
      throw new AppError(404, 'EMPLOYER_ACCOUNT_NOT_FOUND', 'Employer account not found.');
    }

    return toIndividualEmployerAccountDto(updated);
  }
}
