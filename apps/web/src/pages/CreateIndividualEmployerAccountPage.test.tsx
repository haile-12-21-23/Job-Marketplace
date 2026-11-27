import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '../app/providers.js';
import { createAppStore } from '../app/store.js';
import { setAuthSession } from '../app/auth-slice.js';
import { routes } from '../app/router.js';

describe('CreateIndividualEmployerAccountPage', () => {
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

  function renderCreatePage() {
    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'in-memory-bearer-jwt',
        expiresIn: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe Bikila',
          email: 'abebe@example.com',
        },
      }),
    );

    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ['/app/employer-accounts/new'],
    });

    const rendered = render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );

    return { store, memoryRouter, ...rendered };
  }

  it('validates fields client-side, prevents duplicate submits, attaches Bearer token without ownerUserId, and navigates on 201', async () => {
    const user = userEvent.setup();
    const createdId = '9ba7b810-9dad-11d1-80b4-00c04fd43001';

    let resolvePost!: (res: Response) => void;
    const postDeferred = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });

    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      const method = input instanceof Request ? input.method : 'GET';
      if (url.endsWith('/employer-accounts') && method === 'POST') {
        return postDeferred;
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: createdId,
              type: 'INDIVIDUAL',
              status: 'ACTIVE',
              verificationStatus: 'UNVERIFIED',
              createdAt: '2026-11-27T14:00:00.000Z',
              updatedAt: '2026-11-27T14:00:00.000Z',
              profile: {
                publicName: 'Abebe Recruiting',
                contactPhone: '+251911000000',
                countryCode: 'ET',
                city: 'Addis Ababa',
                updatedAt: '2026-11-27T14:00:00.000Z',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderCreatePage();

    // Invalid short publicName and invalid countryCode -> client-side validation blocks request
    await user.type(screen.getByLabelText(/Public Name/i), 'A');
    await user.type(screen.getByLabelText(/Country Code/i), 'E');
    await user.click(screen.getByRole('button', { name: 'Create Individual Account' }));

    expect(screen.getByText('Public name must be at least 2 characters')).toBeDefined();
    expect(
      screen.getByText('Country code must be a 2-letter ISO 3166-1 alpha-2 code'),
    ).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();

    // Valid inputs -> single in-flight POST with Bearer header and NO ownerUserId
    await user.clear(screen.getByLabelText(/Public Name/i));
    await user.type(screen.getByLabelText(/Public Name/i), '  Abebe Recruiting  ');
    await user.type(screen.getByLabelText(/Contact Phone/i), ' +251911000000 ');
    await user.clear(screen.getByLabelText(/Country Code/i));
    await user.type(screen.getByLabelText(/Country Code/i), 'et');
    await user.type(screen.getByLabelText(/City/i), ' Addis Ababa ');

    const submitBtn = screen.getByRole('button', { name: 'Create Individual Account' });
    await user.click(submitBtn);
    await user.click(submitBtn); // ignored while loading

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const req = mockFetch.mock.calls[0]![0] as Request;
    expect(req.headers.get('Authorization')).toBe('Bearer in-memory-bearer-jwt');
    const submittedBody = JSON.parse(await req.clone().text());
    expect(submittedBody).toEqual({
      publicName: 'Abebe Recruiting',
      contactPhone: '+251911000000',
      countryCode: 'ET',
      city: 'Addis Ababa',
    });
    expect(submittedBody.ownerUserId).toBeUndefined();
    expect(submittedBody.userId).toBeUndefined();

    resolvePost(
      new Response(
        JSON.stringify({
          data: {
            id: createdId,
            type: 'INDIVIDUAL',
            status: 'ACTIVE',
            verificationStatus: 'UNVERIFIED',
            createdAt: '2026-11-27T14:00:00.000Z',
            updatedAt: '2026-11-27T14:00:00.000Z',
            profile: {
              publicName: 'Abebe Recruiting',
              contactPhone: '+251911000000',
              countryCode: 'ET',
              city: 'Addis Ababa',
              updatedAt: '2026-11-27T14:00:00.000Z',
            },
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Abebe Recruiting' }),
    ).toBeDefined();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('displays Problem Details field errors and generic network failure alerts', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Unprocessable Entity',
            status: 422,
            code: 'VALIDATION_ERROR',
            detail: 'Validation failed.',
            errors: [
              { pointer: '#/publicName', code: 'TOO_SMALL', detail: 'Server public name error' },
            ],
          }),
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderCreatePage();
    await user.type(screen.getByLabelText(/Public Name/i), 'Valid Studio');
    await user.click(screen.getByRole('button', { name: 'Create Individual Account' }));

    await waitFor(() => {
      expect(screen.getByText('Server public name error')).toBeDefined();
      expect(screen.getByRole('alert')).toHaveTextContent('Validation failed.');
    });

    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network offline');
    });
    await user.click(screen.getByRole('button', { name: 'Create Individual Account' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'An unexpected network error occurred. Please try again.',
      );
    });
  });
});
