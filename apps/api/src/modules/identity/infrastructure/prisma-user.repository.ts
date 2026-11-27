import { PrismaClient } from '../../../generated/prisma/client.js';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { prisma as lazyPrisma } from '../../../infrastructure/database/prisma.js';
import { AppError } from '../../../errors/app-error.js';
import type {
  UserRepository,
  CreateUserInput,
  UserRecord,
  UserCredentialRecord,
} from '../ports/user.repository.js';

export class PrismaUserRepository implements UserRepository {
  private readonly client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client ?? lazyPrisma;
  }

  async findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    const user = await this.client.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findCredentialsByEmail(normalizedEmail: string): Promise<UserCredentialRecord | null> {
    const user = await this.client.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        displayName: true,
        email: true,
        passwordHash: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      return null;
    }

    return user;
  }

  async create(data: CreateUserInput): Promise<UserRecord> {
    try {
      const user = await this.client.user.create({
        data: {
          displayName: data.displayName,
          email: data.email,
          passwordHash: data.passwordHash,
          status: data.status ?? UserStatus.ACTIVE,
          emailVerifiedAt: null,
        },
      });

      return {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (err: unknown) {
      // Prisma error code P2002 represents a unique constraint violation
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
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
      throw err;
    }
  }
}
