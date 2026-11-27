import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAppStore } from './store.js';
import {
  clearAuthSession,
  selectAccessToken,
  selectCurrentUser,
  selectExpiresAt,
  selectIsAuthenticated,
  setAuthSession,
} from './auth-slice.js';

const sampleUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Abebe Bikila',
  email: 'abebe@example.com',
};

describe('authSlice expiration handling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('records absolute expiresAt on setAuthSession and treats session as valid until expiry', () => {
    vi.useFakeTimers();
    const baseTime = new Date('2026-11-27T09:00:00.000Z').getTime();
    vi.setSystemTime(baseTime);

    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'short-lived-jwt',
        expiresIn: 900,
        user: sampleUser,
      }),
    );

    const expectedExpiresAt = baseTime + 900_000;
    expect(store.getState().auth.expiresAt).toBe(expectedExpiresAt);
    expect(selectExpiresAt(store.getState())).toBe(expectedExpiresAt);
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(selectAccessToken(store.getState())).toBe('short-lived-jwt');
    expect(selectCurrentUser(store.getState())).toEqual(sampleUser);

    // One millisecond before expiry, session remains valid
    vi.advanceTimersByTime(899_999);
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(selectAccessToken(store.getState())).toBe('short-lived-jwt');

    // At exact expiry timestamp, middleware clears in-memory auth state
    vi.advanceTimersByTime(1);
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(selectAccessToken(store.getState())).toBeNull();
    expect(selectCurrentUser(store.getState())).toBeNull();
    expect(selectExpiresAt(store.getState())).toBeNull();
    expect(store.getState().auth).toEqual({
      accessToken: null,
      expiresIn: null,
      expiresAt: null,
      user: null,
      status: 'unauthenticated',
      authNotice: null,
      authNoticeKind: null,
    });
  });

  it('rejects expired tokens in selectors even if a scheduled timer has not fired yet', () => {
    const baseTime = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseTime);

    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'jwt-before-sleep',
        expiresIn: 900,
        user: sampleUser,
      }),
    );

    expect(selectIsAuthenticated(store.getState())).toBe(true);

    // Simulate clock advancing past expiresAt (e.g. device sleep) without timer firing
    nowSpy.mockReturnValue(baseTime + 900_000);
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(selectAccessToken(store.getState())).toBeNull();
    expect(selectCurrentUser(store.getState())).toBeNull();
    expect(selectExpiresAt(store.getState())).toBeNull();
  });

  it('immediately clears non-positive or already-expired sessions', () => {
    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'already-expired-jwt',
        expiresIn: 0,
        user: sampleUser,
      }),
    );

    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(store.getState().auth).toEqual({
      accessToken: null,
      expiresIn: null,
      expiresAt: null,
      user: null,
      status: 'unauthenticated',
      authNotice: null,
      authNoticeKind: null,
    });
  });

  it('cancels pending expiry timer when clearAuthSession is dispatched manually', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T09:00:00.000Z'));

    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'jwt-1',
        expiresIn: 900,
        user: sampleUser,
      }),
    );
    store.dispatch(clearAuthSession());

    expect(selectIsAuthenticated(store.getState())).toBe(false);
    vi.advanceTimersByTime(900_000);
    expect(store.getState().auth.accessToken).toBeNull();
  });
});
