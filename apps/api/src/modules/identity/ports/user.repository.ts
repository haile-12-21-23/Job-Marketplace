import { UserStatus } from '../../../generated/prisma/enums.js';

export interface CreateUserInput {
  displayName: string;
  email: string;
  passwordHash: string;
  status?: UserStatus | undefined;
}

export interface UserRecord {
  id: string;
  displayName: string;
  email: string;
  passwordHash?: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRepository {
  findByEmail(normalizedEmail: string): Promise<UserRecord | null>;
  create(data: CreateUserInput): Promise<UserRecord>;
}
