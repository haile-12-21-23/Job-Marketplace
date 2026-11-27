import type { IndividualEmployerAccountDto } from '@jmp/contracts';
import { AppError } from '../../../errors/app-error.js';
import { toIndividualEmployerAccountDto } from '../domain/individual-employer-account.mapper.js';
import type { EmployerAccountRepository } from '../ports/employer-account.repository.js';

export class GetIndividualEmployerAccountUseCase {
  constructor(private readonly employerAccountRepository: EmployerAccountRepository) {}

  async execute(employerAccountId: string): Promise<IndividualEmployerAccountDto> {
    const account =
      await this.employerAccountRepository.findIndividualAccountById(employerAccountId);

    if (!account) {
      throw new AppError(404, 'EMPLOYER_ACCOUNT_NOT_FOUND', 'Employer account not found.');
    }

    return toIndividualEmployerAccountDto(account);
  }
}
