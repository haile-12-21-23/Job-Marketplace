import { describe, it, expect, vi } from 'vitest';
import { CryptoRefreshTokenService } from '../domain/refresh-token.js';
import type { SessionRepository } from '../ports/session.repository.js';
import { LogoutSessionUseCase } from './logout-session.use-case.js';

describe('LogoutSessionUseCase', () => {
  it('revokes token family for present cookie and is idempotent when missing', async () => {
    const refreshTokenService = new CryptoRefreshTokenService();
    const now = new Date('2026-11-26T12:00:00Z');
    const revokeFamilyByTokenHash = vi.fn(async () => ({
      revokedCount: 1,
      tokenFamilyId: 'fam-1',
    }));

    const sessionRepo = {
      revokeFamilyByTokenHash,
    } as unknown as SessionRepository;

    const useCase = new LogoutSessionUseCase({
      sessionRepository: sessionRepo,
      refreshTokenService,
      clock: () => now,
    });

    const missingResult = await useCase.execute(null);
    expect(missingResult).toEqual({ loggedOut: true });
    expect(revokeFamilyByTokenHash).not.toHaveBeenCalled();

    const rawToken = refreshTokenService.generateToken();
    const presentResult = await useCase.execute(rawToken);
    expect(presentResult).toEqual({ loggedOut: true });
    expect(revokeFamilyByTokenHash).toHaveBeenCalledWith(
      refreshTokenService.hashToken(rawToken),
      now,
    );
  });
});
