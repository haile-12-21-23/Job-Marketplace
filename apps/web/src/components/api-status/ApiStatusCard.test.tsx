import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ApiStatusCard } from './ApiStatusCard.js';
import { AppProviders } from '../../app/providers.js';
import { createAppStore } from '../../app/store.js';

describe('ApiStatusCard (RTK Query sample component)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('displays loading state indicator while request is pending', () => {
    // Hang the fetch promise to verify loading state
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));

    const store = createAppStore();
    render(
      <AppProviders storeInstance={store}>
        <ApiStatusCard />
      </AppProviders>,
    );

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Connecting to API service...')).toBeDefined();
  });

  it('displays error state and retry button when request fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Internal Server Error', { status: 500 });
    });

    const store = createAppStore();
    render(
      <AppProviders storeInstance={store}>
        <ApiStatusCard />
      </AppProviders>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toBeDefined();
    expect(screen.getByText('API Connection Unavailable')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('triggers a refetch when Retry button is clicked', async () => {
    const user = userEvent.setup();
    let callCount = 0;

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(
        JSON.stringify({
          data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const store = createAppStore();
    render(
      <AppProviders storeInstance={store}>
        <ApiStatusCard />
      </AppProviders>,
    );

    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    expect(retryBtn).toBeDefined();

    await user.click(retryBtn);

    const successContainer = await screen.findByTestId('api-status-success');
    expect(successContainer).toBeDefined();
    expect(screen.getByText('Job Marketplace API')).toBeDefined();
    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('displays success state with returned service metadata from data envelope', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const store = createAppStore();
    render(
      <AppProviders storeInstance={store}>
        <ApiStatusCard />
      </AppProviders>,
    );

    const successContainer = await screen.findByTestId('api-status-success');
    expect(successContainer).toBeDefined();
    expect(screen.getByText('Job Marketplace API')).toBeDefined();
    expect(screen.getByText('v1')).toBeDefined();
    expect(screen.getByText('ok')).toBeDefined();
    expect(screen.getByText('Connected')).toBeDefined();
  });
});
