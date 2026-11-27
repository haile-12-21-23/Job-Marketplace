export interface UserSessionRecord {
  id: string;
  userId: string;
  tokenFamilyId: string;
  refreshTokenHash: string;
  parentSessionId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  tokenFamilyId: string;
  refreshTokenHash: string;
  parentSessionId: string | null;
  expiresAt: Date;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<UserSessionRecord>;
}
