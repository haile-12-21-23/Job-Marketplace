import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '../app/providers.js';
import { createAppStore } from '../app/store.js';
import { setAuthSession } from '../app/auth-slice.js';
import { routes } from '../app/router.js';

describe('IndividualEmployerAccountPage', () => {
  const accountId = '9ba7b810-9dad-11d1-80b4-00c04fd43001';
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  function renderDetailPage() {
    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'detail-bearer-jwt',
        expiresIn: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe Bikila',
          email: 'abebe@example.com',
        },
      }),
    );

    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: [`/app/employer-accounts/${accountId}`],
    });

    return render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );
  }

  it('loads individual employer account with Bearer auth, rejects unchanged save, and dispatches owner PATCH', async () => {
    const user = userEvent.setup();

    let currentProfile = {
      publicName: 'Initial Solo Studio',
      contactPhone: '+251911000000',
      countryCode: 'ET',
      city: 'Addis Ababa',
      updatedAt: '2026-11-27T14:00:00.000Z',
    };

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const req = input instanceof Request ? input : null;
      const method = req?.method ?? 'GET';
      if (method === 'PATCH') {
        const body = JSON.parse(await req!.clone().text());
        currentProfile = {
          ...currentProfile,
          ...body,
          updatedAt: '2026-11-27T14:05:00.000Z',
        };
      }
      return new Response(
        JSON.stringify({
          data: {
            id: accountId,
            type: 'INDIVIDUAL',
            status: 'ACTIVE',
            verificationStatus: 'UNVERIFIED',
            createdAt: '2026-11-27T14:00:00.000Z',
            updatedAt: '2026-11-27T14:00:00.000Z',
            profile: currentProfile,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderDetailPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Initial Solo Studio' }),
    ).toBeDefined();
    expect(screen.getByText('Status: ACTIVE')).toBeDefined();
    expect(screen.getByText('Verification: UNVERIFIED')).toBeDefined();

    // Unchanged submit is blocked by client-side empty patch check
    await user.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'At least one profile field must be provided for update',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1); // initial GET only

    // Update name and clear city -> PATCH sends only changed editable fields with Bearer token
    await user.clear(screen.getByLabelText(/Public Name/i));
    await user.type(screen.getByLabelText(/Public Name/i), 'Updated Solo Studio');
    await user.clear(screen.getByLabelText(/City/i));
    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated successfully.');
    const patchCall = mockFetch.mock.calls.find(
      (call) => (call[0] as Request).method === 'PATCH',
    )![0] as Request;
    expect(patchCall.headers.get('Authorization')).toBe('Bearer detail-bearer-jwt');
    const sentPatch = JSON.parse(await patchCall.clone().text());
    expect(sentPatch).toEqual({
      publicName: 'Updated Solo Studio',
      city: null,
    });
    expect(sentPatch.ownerUserId).toBeUndefined();
  });

  it('shows unavailable error panel when account is missing or unauthorized (404/403)', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            code: 'EMPLOYER_ACCOUNT_NOT_FOUND',
            detail: 'Employer account not found.',
          }),
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Employer Account Unavailable' }),
      ).toBeDefined();
      expect(screen.getByRole('alert')).toHaveTextContent('Employer account not found.');
    });
  });
});
