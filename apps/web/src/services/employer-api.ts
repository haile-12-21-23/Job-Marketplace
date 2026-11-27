import type {
  CreateIndividualEmployerAccountRequest,
  CreateIndividualEmployerAccountResponse,
  GetIndividualEmployerAccountResponse,
  UpdateIndividualEmployerProfileRequest,
  UpdateIndividualEmployerProfileResponse,
} from '@jmp/contracts';
import { baseApi } from './base-api.js';

export interface UpdateEmployerProfileMutationArg {
  employerAccountId: string;
  body: UpdateIndividualEmployerProfileRequest;
}

/**
 * RTK Query endpoints for individual employer accounts under /api/v1/employer-accounts.
 * Bearer tokens are attached from in-memory Redux state by baseApi; client never supplies ownerUserId.
 */
export const employerApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createIndividualEmployerAccount: builder.mutation<
      CreateIndividualEmployerAccountResponse,
      CreateIndividualEmployerAccountRequest
    >({
      query: (body) => ({
        url: '/employer-accounts',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'EmployerAccount', id: 'LIST' }],
    }),
    getIndividualEmployerAccount: builder.query<GetIndividualEmployerAccountResponse, string>({
      query: (employerAccountId) => `/employer-accounts/${encodeURIComponent(employerAccountId)}`,
      providesTags: (result, _error, employerAccountId) => [
        { type: 'EmployerAccount', id: result?.data.id ?? employerAccountId },
      ],
    }),
    updateIndividualEmployerProfile: builder.mutation<
      UpdateIndividualEmployerProfileResponse,
      UpdateEmployerProfileMutationArg
    >({
      query: ({ employerAccountId, body }) => ({
        url: `/employer-accounts/${encodeURIComponent(employerAccountId)}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { employerAccountId }) => [
        { type: 'EmployerAccount', id: employerAccountId },
      ],
    }),
  }),
});

export const {
  useCreateIndividualEmployerAccountMutation,
  useGetIndividualEmployerAccountQuery,
  useUpdateIndividualEmployerProfileMutation,
} = employerApi;
