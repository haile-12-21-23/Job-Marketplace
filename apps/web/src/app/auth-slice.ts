import { createSlice, type Middleware, type PayloadAction } from '@reduxjs/toolkit';
import type { LoginUser } from '@jmp/contracts';

const MAX_TIMEOUT_MS = 2_147_483_647;

export interface AuthState {
  accessToken: string | null;
  expiresIn: number | null;
  expiresAt: number | null;
  user: LoginUser | null;
}

export interface SetAuthSessionPayload {
  accessToken: string;
  expiresIn: number;
  user: LoginUser;
  expiresAt?: number;
}

const initialState: AuthState = {
  accessToken: null,
  expiresIn: null,
  expiresAt: null,
  user: null,
};

/**
 * Determines whether the current in-memory auth session is missing or expired.
 */
export function isAuthSessionExpired(
  auth: {
    accessToken?: string | null | undefined;
    expiresAt?: number | null | undefined;
  },
  now: number = Date.now(),
): boolean {
  if (typeof auth.accessToken !== 'string' || auth.accessToken.length === 0) {
    return true;
  }
  if (typeof auth.expiresAt !== 'number' || !Number.isFinite(auth.expiresAt)) {
    return true;
  }
  return now >= auth.expiresAt;
}

/**
 * In-memory authentication state slice.
 * Access tokens and user summary reside strictly in Redux memory (never persisted to browser storage).
 */
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthSession: {
      reducer: (
        state,
        action: PayloadAction<{
          accessToken: string;
          expiresIn: number;
          expiresAt: number;
          user: LoginUser;
        }>,
      ) => {
        state.accessToken = action.payload.accessToken;
        state.expiresIn = action.payload.expiresIn;
        state.expiresAt = action.payload.expiresAt;
        state.user = action.payload.user;
      },
      prepare: (payload: SetAuthSessionPayload) => {
        const ttlMs =
          Number.isFinite(payload.expiresIn) && payload.expiresIn > 0
            ? payload.expiresIn * 1000
            : 0;
        const expiresAt = payload.expiresAt !== undefined ? payload.expiresAt : Date.now() + ttlMs;
        return {
          payload: {
            accessToken: payload.accessToken,
            expiresIn: payload.expiresIn,
            expiresAt,
            user: payload.user,
          },
        };
      },
    },
    clearAuthSession: (state) => {
      state.accessToken = null;
      state.expiresIn = null;
      state.expiresAt = null;
      state.user = null;
    },
  },
});

export const { setAuthSession, clearAuthSession } = authSlice.actions;

export const selectAccessToken = (state: { auth: AuthState }): string | null =>
  isAuthSessionExpired(state.auth) ? null : state.auth.accessToken;
export const selectCurrentUser = (state: { auth: AuthState }): LoginUser | null =>
  isAuthSessionExpired(state.auth) ? null : state.auth.user;
export const selectExpiresAt = (state: { auth: AuthState }): number | null =>
  isAuthSessionExpired(state.auth) ? null : state.auth.expiresAt;
export const selectIsAuthenticated = (state: { auth: AuthState }): boolean =>
  !isAuthSessionExpired(state.auth);

/**
 * Redux middleware that clears the in-memory auth session once its absolute `expiresAt`
 * timestamp is reached. Scoped per store instance so isolated test stores do not collide.
 */
export function createAuthExpiryMiddleware<
  S extends { auth: AuthState } = { auth: AuthState },
>(): Middleware<object, S> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearScheduledExpiry = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return (storeApi) => {
    const scheduleExpiry = (expiresAt: number): void => {
      clearScheduledExpiry();
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        storeApi.dispatch(clearAuthSession());
        return;
      }

      const delayMs = Math.min(remainingMs, MAX_TIMEOUT_MS);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        const currentAuth = storeApi.getState().auth;
        if (currentAuth.accessToken === null) {
          return;
        }
        if (isAuthSessionExpired(currentAuth)) {
          storeApi.dispatch(clearAuthSession());
        } else if (currentAuth.expiresAt !== null) {
          scheduleExpiry(currentAuth.expiresAt);
        }
      }, delayMs);

      if (
        typeof timeoutId === 'object' &&
        timeoutId !== null &&
        'unref' in timeoutId &&
        typeof (timeoutId as { unref?: () => void }).unref === 'function'
      ) {
        (timeoutId as { unref: () => void }).unref();
      }
    };

    return (next) => (action) => {
      const result = next(action);

      if (setAuthSession.match(action)) {
        const auth = storeApi.getState().auth;
        if (isAuthSessionExpired(auth)) {
          clearScheduledExpiry();
          storeApi.dispatch(clearAuthSession());
        } else if (auth.expiresAt !== null) {
          scheduleExpiry(auth.expiresAt);
        }
      } else if (clearAuthSession.match(action)) {
        clearScheduledExpiry();
      }

      return result;
    };
  };
}
