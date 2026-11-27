import { baseApi } from './base-api.js';
import type {
  ConfirmPasswordResetRequest,
  ConfirmPasswordResetResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  RequestPasswordResetRequest,
  RequestPasswordResetResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@jmp/contracts';

/**
 * RTK Query endpoints for authentication operations.
 * Injects auth mutations into the central baseApi instance.
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
    verifyEmail: builder.mutation<VerifyEmailResponse, VerifyEmailRequest>({
      query: (body) => ({
        url: '/auth/verify-email',
        method: 'POST',
        body,
      }),
    }),
    resendVerification: builder.mutation<ResendVerificationResponse, ResendVerificationRequest>({
      query: (body) => ({
        url: '/auth/resend-verification',
        method: 'POST',
        body,
      }),
    }),
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: '/auth/login',
        method: 'POST',
        body,
        credentials: 'include',
      }),
    }),
    refresh: builder.mutation<RefreshResponse, void>({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
        credentials: 'include',
      }),
    }),
    logout: builder.mutation<LogoutResponse, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
        credentials: 'include',
      }),
    }),
    requestPasswordReset: builder.mutation<
      RequestPasswordResetResponse,
      RequestPasswordResetRequest
    >({
      query: (body) => ({
        url: '/auth/password-reset/request',
        method: 'POST',
        body,
      }),
    }),
    confirmPasswordReset: builder.mutation<
      ConfirmPasswordResetResponse,
      ConfirmPasswordResetRequest
    >({
      query: (body) => ({
        url: '/auth/password-reset/confirm',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useRequestPasswordResetMutation,
  useConfirmPasswordResetMutation,
} = authApi;
