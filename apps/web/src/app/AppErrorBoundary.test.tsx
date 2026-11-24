import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AppErrorBoundary } from '../app/AppErrorBoundary.js';

// A component that throws during render to trigger the boundary
function BrokenComponent({ shouldThrow }: { shouldThrow: boolean }): React.JSX.Element {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <p>All good</p>;
}

// Suppress console.error from React's internal error reporting in tests
const originalConsoleError = console.error;
function suppressExpectedErrors(): void {
  console.error = vi.fn();
}
function restoreConsoleError(): void {
  console.error = originalConsoleError;
}

describe('AppErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <AppErrorBoundary>
        <BrokenComponent shouldThrow={false} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeDefined();
  });

  it('shows the fallback UI when a child throws during render', () => {
    suppressExpectedErrors();
    render(
      <AppErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </AppErrorBoundary>,
    );
    restoreConsoleError();

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('provides a "Try again" button in the fallback UI', () => {
    suppressExpectedErrors();
    render(
      <AppErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </AppErrorBoundary>,
    );
    restoreConsoleError();

    const tryAgainButton = screen.getByRole('button', { name: 'Try again' });
    expect(tryAgainButton).toBeDefined();
  });

  it('resets boundary state when "Try again" is clicked', async () => {
    suppressExpectedErrors();
    const user = userEvent.setup();

    // We need a component that can toggle its throw state
    let shouldThrow = true;
    function ToggleThrow(): React.JSX.Element {
      if (shouldThrow) throw new Error('Toggle error');
      return <p>Recovered</p>;
    }

    const { rerender } = render(
      <AppErrorBoundary>
        <ToggleThrow />
      </AppErrorBoundary>,
    );
    restoreConsoleError();

    expect(screen.getByRole('alert')).toBeDefined();

    // Fix the broken component before resetting
    shouldThrow = false;
    suppressExpectedErrors();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    restoreConsoleError();

    rerender(
      <AppErrorBoundary>
        <ToggleThrow />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Recovered')).toBeDefined();
  });
});
