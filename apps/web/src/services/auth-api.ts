import { baseApi } from './base-api.js';
import type { RegisterRequest, RegisterResponse } from '@jmp/contracts';

/**
 * RTK Query endpoints for authentication operations.
 * Injects register mutation into the central baseApi instance.
 */
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<RegisterResponse, RegisterRequest>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { useRegisterMutation } = authApi;
