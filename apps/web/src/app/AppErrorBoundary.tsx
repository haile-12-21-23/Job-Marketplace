import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * Global React error boundary.
 *
 * React error boundaries catch errors thrown during rendering, in lifecycle
 * methods, and in constructors of child components. They do NOT catch errors
 * in event handlers or asynchronous callbacks (use try/catch there instead).
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, errorMessage: message };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Log to the console in development; swap for a monitoring service in production.
    if (import.meta.env.DEV) {
      console.error('[AppErrorBoundary] Caught render error:', error, info);
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4 py-16 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-8 w-8 text-red-600"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="max-w-md space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              Something went wrong
            </h1>
            <p className="text-slate-600">
              The page encountered an unexpected error. You can try refreshing
              or clicking the button below to recover.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
