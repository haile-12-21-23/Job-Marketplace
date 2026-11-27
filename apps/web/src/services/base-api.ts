import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { DataEnvelope } from '@jmp/contracts';
import { clearAuthSession, isAuthSessionExpired, type AuthState } from '../app/auth-slice.js';

/**
 * Service metadata contract returned by GET /api/v1.
 */
export interface ServiceMetadata {
  service: string;
  version: string;
  status: string;
}

export type ServiceMetadataResponse = DataEnvelope<ServiceMetadata>;

/**
 * Normalizes the API base URL from the Vite environment.
 * Defaults to the local development URL (http://localhost:3000/api/v1).
 * Strips any trailing slashes to guarantee clean endpoint URL concatenation.
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  const rawUrl =
    typeof envUrl === 'string' && envUrl.trim() !== ''
      ? envUrl.trim()
      : 'http://localhost:3000/api/v1';

  return rawUrl.replace(/\/+$/, '');
}

interface StoreAuthSliceShape {
  auth?: AuthState;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: getApiBaseUrl(),
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const auth = (getState() as StoreAuthSliceShape).auth;
    if (auth && !isAuthSessionExpired(auth) && auth.accessToken) {
      headers.set('Authorization', `Bearer ${auth.accessToken}`);
    }
    return headers;
  },
});

const baseQueryWithAuthExpiry: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const auth = (api.getState() as StoreAuthSliceShape).auth;
  if (auth && auth.accessToken !== null && isAuthSessionExpired(auth)) {
    api.dispatch(clearAuthSession());
  }
  return rawBaseQuery(args, api, extraOptions);
};

/**
 * Central RTK Query Base API for the Job Marketplace application.
 * Configures credentialed requests (`credentials: 'include'`) for cross-origin localhost
 * HttpOnly refresh cookies and attaches the in-memory Bearer access token when valid.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuthExpiry,
  tagTypes: ['ServiceStatus'],
  endpoints: (builder) => ({
    getServiceStatus: builder.query<ServiceMetadataResponse, void>({
      query: () => '',
      providesTags: ['ServiceStatus'],
    }),
  }),
});

export const { useGetServiceStatusQuery } = baseApi;
