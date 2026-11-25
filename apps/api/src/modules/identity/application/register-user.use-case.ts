import { normalizeEmail, type RegisterRequest, type RegisterResponseData } from '@jmp/contracts';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import type { UserRepository } from '../ports/user.repository.js';
import type { PasswordHasher } from '../domain/password-hasher.js';

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegisterRequest): Promise<RegisterResponseData> {
    // 1. Normalize email and trim display name
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedDisplayName = input.displayName.trim();

    // 2. Pre-insert existence check for safe diagnostic messaging
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError(
        409,
        'EMAIL_ALREADY_EXISTS',
        'An account with this email address already exists.',
        true,
        [
          {
            pointer: '#/email',
            code: 'DUPLICATE_EMAIL',
            detail: 'An account with this email address already exists.',
          },
        ],
      );
    }

    // 3. Asynchronously hash the submitted password
    const passwordHash = await this.passwordHasher.hash(input.password);

    // 4. Create base user identity (initial status ACTIVE, unverified emailVerifiedAt = null)
    const user = await this.userRepository.create({
      displayName: normalizedDisplayName,
      email: normalizedEmail,
      passwordHash,
      status: UserStatus.ACTIVE,
    });

    // 5. Return safe public response DTO; never expose passwords, hashes, or tokens
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      emailVerificationRequired: true,
    };
  }
}
