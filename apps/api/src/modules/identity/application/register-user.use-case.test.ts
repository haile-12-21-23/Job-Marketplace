import { describe, it, expect, vi } from 'vitest';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { AppError } from '../../../errors/app-error.js';
import { RegisterUserUseCase } from './register-user.use-case.js';
import type { UserRepository, CreateUserInput, UserRecord } from '../ports/user.repository.js';
import type { PasswordHasher } from '../domain/password-hasher.js';

class InMemoryUserRepository implements UserRepository {
  public users: UserRecord[] = [];
  public failOnCreateWithP2002 = false;

  async findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.email === normalizedEmail);
    return user ?? null;
  }

  async create(data: CreateUserInput): Promise<UserRecord> {
    if (this.failOnCreateWithP2002) {
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

    const record: UserRecord = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: data.displayName,
      email: data.email,
      passwordHash: data.passwordHash,
      status: data.status ?? UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date('2026-11-25T10:00:00Z'),
      updatedAt: new Date('2026-11-25T10:00:00Z'),
    };
    this.users.push(record);
    return record;
  }
}

class FakePasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return `hashed_${plaintext}`;
  }

  async compare(plaintext: string, hash: string): Promise<boolean> {
    return hash === `hashed_${plaintext}`;
  }
}

describe('RegisterUserUseCase', () => {
  it('registers a user with normalized email, trimmed display name, and hashed password', async () => {
    const userRepo = new InMemoryUserRepository();
    const hasher = new FakePasswordHasher();
    const useCase = new RegisterUserUseCase(userRepo, hasher);

    const result = await useCase.execute({
      displayName: '  Hailemariam Addisu  ',
      email: '  Haile.Addisu@Example.COM  ',
      password: 'StrongPassword123!',
    });

    // 1. Result DTO validation
    expect(result).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Hailemariam Addisu',
      email: 'haile.addisu@example.com',
      emailVerificationRequired: true,
    });

    // 2. Never expose secrets in response
    expect((result as Record<string, unknown>)['password']).toBeUndefined();
    expect((result as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect((result as Record<string, unknown>)['token']).toBeUndefined();

    // 3. Persisted record invariants
    const saved = userRepo.users[0];
    expect(saved).toBeDefined();
    expect(saved?.displayName).toBe('Hailemariam Addisu');
    expect(saved?.email).toBe('haile.addisu@example.com');
    expect(saved?.passwordHash).toBe('hashed_StrongPassword123!');
    expect(saved?.passwordHash).not.toBe('StrongPassword123!');
    expect(saved?.status).toBe(UserStatus.ACTIVE);
    expect(saved?.emailVerifiedAt).toBeNull();
  });

  it('rejects duplicate email in pre-insert check', async () => {
    const userRepo = new InMemoryUserRepository();
    const hasher = new FakePasswordHasher();
    const useCase = new RegisterUserUseCase(userRepo, hasher);

    userRepo.users.push({
      id: '11111111-1111-1111-1111-111111111111',
      displayName: 'Existing User',
      email: 'existing@example.com',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      useCase.execute({
        displayName: 'New Applicant',
        email: '  Existing@example.COM  ',
        password: 'ValidPassword123!',
      }),
    ).rejects.toThrowError(AppError);

    try {
      await useCase.execute({
        displayName: 'New Applicant',
        email: 'existing@example.com',
        password: 'ValidPassword123!',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(409);
      expect(appErr.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(appErr.errors).toEqual([
        {
          pointer: '#/email',
          code: 'DUPLICATE_EMAIL',
          detail: 'An account with this email address already exists.',
        },
      ]);
    }
  });

  it('propagates safe conflict error when database unique constraint catches a race condition', async () => {
    const userRepo = new InMemoryUserRepository();
    userRepo.failOnCreateWithP2002 = true;
    const hasher = new FakePasswordHasher();
    const useCase = new RegisterUserUseCase(userRepo, hasher);

    await expect(
      useCase.execute({
        displayName: 'Concurrent Applicant',
        email: 'race@example.com',
        password: 'ValidPassword123!',
      }),
    ).rejects.toThrowError(AppError);
  });

  it('does not create a session, employer account, or candidate profile', async () => {
    const userRepo = new InMemoryUserRepository();
    const hasher = new FakePasswordHasher();
    const useCase = new RegisterUserUseCase(userRepo, hasher);

    const createSpy = vi.spyOn(userRepo, 'create');

    await useCase.execute({
      displayName: 'Plain Identity',
      email: 'plain@example.com',
      password: 'ValidPassword123!',
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const createArg = createSpy.mock.calls[0]?.[0];
    // Only base user fields submitted to persistence
    expect(createArg).toEqual({
      displayName: 'Plain Identity',
      email: 'plain@example.com',
      passwordHash: 'hashed_ValidPassword123!',
      status: UserStatus.ACTIVE,
    });
  });
});
