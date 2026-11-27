import type {
  CreateIndividualEmployerAccountRequest,
  IndividualEmployerAccountDto,
} from '@jmp/contracts';
import { AppError } from '../../../errors/app-error.js';
import { isUuid } from '../../authorization/index.js';
import { toIndividualEmployerAccountDto } from '../domain/individual-employer-account.mapper.js';
import type { EmployerAccountRepository } from '../ports/employer-account.repository.js';

export class CreateIndividualEmployerAccountUseCase {
  constructor(private readonly employerAccountRepository: EmployerAccountRepository) {}

  async execute(
    authenticatedUserId: string,
    input: CreateIndividualEmployerAccountRequest,
  ): Promise<IndividualEmployerAccountDto> {
    if (!isUuid(authenticatedUserId)) {
      throw new AppError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required to access this resource.',
      );
    }

    const created = await this.employerAccountRepository.createIndividualAccount({
      ownerUserId: authenticatedUserId,
      publicName: input.publicName,
      contactPhone: input.contactPhone ?? null,
      countryCode: input.countryCode ?? null,
      city: input.city ?? null,
    });

    return toIndividualEmployerAccountDto(created);
  }
}
