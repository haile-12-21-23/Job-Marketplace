import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './router.js';
import { AppProviders } from './providers.js';
import { createAppStore } from './store.js';

describe('React Router configuration and routes', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function renderWithRouter(initialEntry: string) {
    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: [initialEntry],
    });
    const store = createAppStore();

    return render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );
  }

  it('renders the public layout and home page for "/"', async () => {
    renderWithRouter('/');

    expect(screen.getByLabelText('Job Marketplace home')).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Work that moves your life forward.' }),
    ).toBeDefined();
    expect(screen.getByTestId('api-status-card')).toBeDefined();
  });

  it('renders the authenticated-area placeholder for "/app" without claiming auth', async () => {
    renderWithRouter('/app');

    expect(screen.getByRole('region', { name: 'Placeholder notice' })).toHaveTextContent(
      'Authenticated Area Placeholder',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Candidate & Employer Workspace' }),
    ).toBeDefined();
    expect(screen.getByText('Back to Public Site')).toBeDefined();
  });

  it('renders NotFoundPage for unknown routes', async () => {
    renderWithRouter('/this-does-not-exist');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeDefined();
    expect(screen.getByText('Return to home')).toBeDefined();
  });

  it('allows navigation from public home to /app and back', async () => {
    const user = userEvent.setup();
    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ['/'],
    });
    const store = createAppStore();

    render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );

    // Click Workspace link in header (first matching link in navigation)
    const workspaceLinks = screen.getAllByRole('link', { name: 'Workspace (App)' });
    expect(workspaceLinks.length).toBeGreaterThan(0);
    await user.click(workspaceLinks[0]!);

    // Verify /app content is rendered
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Candidate & Employer Workspace' }),
    ).toBeDefined();

    // Click Back to Public Site link
    const backLink = screen.getByRole('link', { name: 'Back to Public Site' });
    await user.click(backLink);

    // Verify back on home
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Work that moves your life forward.' }),
    ).toBeDefined();
  });

  it('renders the registration page for "/register"', async () => {
    renderWithRouter('/register');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeDefined();
    expect(screen.getByLabelText(/full name/i)).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it('renders the email verification page for "/verify-email"', async () => {
    renderWithRouter('/verify-email');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Verify your email address' }),
    ).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeDefined();
  });
});
