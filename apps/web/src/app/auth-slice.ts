import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LoginUser } from '@jmp/contracts';

export interface AuthState {
  accessToken: string | null;
  expiresIn: number | null;
  user: LoginUser | null;
}

const initialState: AuthState = {
  accessToken: null,
  expiresIn: null,
  user: null,
};

/**
 * In-memory authentication state slice.
 * Access tokens and user summary reside strictly in Redux memory (never persisted to browser storage).
 */
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthSession: (
      state,
      action: PayloadAction<{ accessToken: string; expiresIn: number; user: LoginUser }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.expiresIn = action.payload.expiresIn;
      state.user = action.payload.user;
    },
    clearAuthSession: (state) => {
      state.accessToken = null;
      state.expiresIn = null;
      state.user = null;
    },
  },
});

export const { setAuthSession, clearAuthSession } = authSlice.actions;

export const selectAccessToken = (state: { auth: AuthState }): string | null =>
  state.auth.accessToken;
export const selectCurrentUser = (state: { auth: AuthState }): LoginUser | null => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthState }): boolean =>
  state.auth.accessToken !== null;
