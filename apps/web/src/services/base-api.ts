import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { DataEnvelope } from '@jmp/contracts';

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
  auth?: {
    accessToken?: string | null;
  };
}

/**
 * Central RTK Query Base API for the Job Marketplace application.
 * Configures credentialed requests (`credentials: 'include'`) for cross-origin localhost
 * HttpOnly refresh cookies and attaches the in-memory Bearer access token when present.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: getApiBaseUrl(),
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as StoreAuthSliceShape).auth?.accessToken;
      if (typeof token === 'string' && token.length > 0) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['ServiceStatus'],
  endpoints: (builder) => ({
    getServiceStatus: builder.query<ServiceMetadataResponse, void>({
      query: () => '',
      providesTags: ['ServiceStatus'],
    }),
  }),
});

export const { useGetServiceStatusQuery } = baseApi;
