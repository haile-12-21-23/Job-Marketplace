import type { UserStatus } from '../../../generated/prisma/enums.js';

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

export interface SessionUserEligibility {
  id: string;
  displayName: string;
  email: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
}

export interface SessionRotationCandidate {
  session: UserSessionRecord;
  user: SessionUserEligibility;
}

export interface RotateSessionInput {
  presentedTokenHash: string;
  newSessionId: string;
  newRefreshTokenHash: string;
  now: Date;
}

export type RotateSessionResult =
  | {
      outcome: 'rotated';
      session: UserSessionRecord;
      user: {
        id: string;
        displayName: string;
        email: string;
      };
    }
  | { outcome: 'not_found' }
  | { outcome: 'expired' }
  | { outcome: 'revoked' }
  | { outcome: 'replayed'; tokenFamilyId: string }
  | { outcome: 'user_ineligible' };

export type ReplayCheckResult =
  | { outcome: 'not_found' }
  | { outcome: 'revoked' }
  | { outcome: 'replayed'; tokenFamilyId: string };

export interface RevokeFamilyResult {
  revokedCount: number;
  tokenFamilyId: string | null;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<UserSessionRecord>;
  findRotationCandidateByTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionRotationCandidate | null>;
  rotateSession(input: RotateSessionInput): Promise<RotateSessionResult>;
  revokeFamilyIfReplayed(refreshTokenHash: string, now: Date): Promise<ReplayCheckResult>;
  revokeFamilyByTokenHash(refreshTokenHash: string, now: Date): Promise<RevokeFamilyResult>;
}
