import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { loginRequestSchema, type ProblemDetails } from '@jmp/contracts';
import { useAppDispatch } from '../app/hooks.js';
import { setAuthSession } from '../app/auth-slice.js';
import { useLoginMutation } from '../services/auth-api.js';

interface FieldErrors {
  email?: string | undefined;
  password?: string | undefined;
}

interface LocationStateWithFrom {
  from?: {
    pathname?: string | undefined;
    search?: string | undefined;
  };
}

function getSafeRedirectTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = (state as LocationStateWithFrom).from;
    const pathname = from?.pathname;
    if (
      typeof pathname === 'string' &&
      pathname.startsWith('/') &&
      !pathname.startsWith('//') &&
      pathname !== '/login'
    ) {
      return `${pathname}${typeof from?.search === 'string' ? from.search : ''}`;
    }
  }
  return '/app';
}

export default function LoginPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginUser, { isLoading }] = useLoginMutation();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    setFieldErrors({});
    setGeneralError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issues: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0] as keyof FieldErrors;
        if (fieldName && !issues[fieldName]) {
          issues[fieldName] = issue.message;
        }
      }
      setFieldErrors(issues);
      return;
    }

    try {
      const response = await loginUser(parsed.data).unwrap();
      dispatch(
        setAuthSession({
          accessToken: response.data.accessToken,
          expiresIn: response.data.expiresIn,
          user: response.data.user,
        }),
      );
      setPassword('');
      setEmail('');
      navigate(getSafeRedirectTarget(location.state), { replace: true });
    } catch (err: unknown) {
      // Clear password state on failed attempt
      setPassword('');

      if (
        typeof err === 'object' &&
        err !== null &&
        'data' in err &&
        typeof (err as { data: unknown }).data === 'object' &&
        (err as { data: unknown }).data !== null
      ) {
        const problem = (err as { data: ProblemDetails }).data;
        if (problem.status === 429 || problem.code === 'RATE_LIMIT_EXCEEDED') {
          setGeneralError(problem.detail || 'Too many login attempts. Please try again later.');
          return;
        }

        if (problem.status === 401 || problem.code === 'INVALID_CREDENTIALS') {
          setGeneralError('Invalid email or password.');
          return;
        }

        if (problem.errors && problem.errors.length > 0) {
          const errors: FieldErrors = {};
          for (const item of problem.errors) {
            if (item.pointer === '#/email') {
              errors.email = item.detail;
            } else if (item.pointer === '#/password') {
              errors.password = item.detail;
            }
          }
          setFieldErrors(errors);
        }

        setGeneralError(
          problem.detail || problem.title || 'Sign in failed. Please check your input.',
        );
      } else {
        setGeneralError('An unexpected network error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-brand-line bg-white p-8 shadow-xs">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">Sign in</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Access your Job Marketplace account to manage your profile and applications.
          </p>
        </div>

        {generalError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <div className="flex items-center gap-2 font-medium">
              <span aria-hidden="true">⚠</span>
              <span>{generalError}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="login-email" className="block text-sm font-semibold text-brand-ink">
              Email Address
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldErrors.email ? 'true' : 'false'}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                fieldErrors.email
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
              placeholder="name@example.com"
            />
            {fieldErrors.email && (
              <p
                id="login-email-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-semibold text-brand-ink">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? 'true' : 'false'}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                fieldErrors.password
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
            />
            {fieldErrors.password && (
              <p
                id="login-password-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#12263b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  />
                  <span>Signing in...</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 space-y-2 border-t border-brand-line pt-4 text-center text-xs text-brand-muted">
          <p>
            New to Job Marketplace?{' '}
            <Link to="/register" className="font-semibold text-brand-teal hover:underline">
              Create account
            </Link>
          </p>
          <p>
            Need a new verification link?{' '}
            <Link to="/verify-email" className="font-semibold text-brand-navy hover:underline">
              Resend verification email
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
