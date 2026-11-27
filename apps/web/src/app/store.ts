import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from '../services/base-api.js';
import { authSlice, createAuthExpiryMiddleware } from './auth-slice.js';

export function createAppStore(preloadedState?: Record<string, unknown>) {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      [authSlice.reducerPath]: authSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware, createAuthExpiryMiddleware()),
    preloadedState,
  });
}

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
