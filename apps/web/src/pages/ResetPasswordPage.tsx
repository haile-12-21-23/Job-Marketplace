import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { confirmPasswordResetRequestSchema, type ProblemDetails } from '@jmp/contracts';
import { useConfirmPasswordResetMutation } from '../services/auth-api.js';

interface FieldErrors {
  newPassword?: string | undefined;
  confirmPassword?: string | undefined;
}

type ResetStatus = 'form' | 'success' | 'invalid';

function extractProblemDetails(err: unknown): ProblemDetails | null {
  if (
    typeof err === 'object' &&
    err !== null &&
    'data' in err &&
    typeof (err as { data: unknown }).data === 'object' &&
    (err as { data: unknown }).data !== null
  ) {
    return (err as { data: ProblemDetails }).data;
  }
  return null;
}

export default function ResetPasswordPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlToken = searchParams.get('token')?.trim() ?? '';
  const hasTokenParam = searchParams.has('token');

  // Hold reset token only in component memory; never persist to Redux or browser storage.
  const [capturedToken, setCapturedToken] = useState<string | null>(
    urlToken.length > 0 ? urlToken : null,
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [status, setStatus] = useState<ResetStatus>(urlToken.length > 0 ? 'form' : 'invalid');
  const [statusMessage, setStatusMessage] = useState<string | null>(
    urlToken.length > 0
      ? null
      : 'This password reset link is missing or invalid. Request a new link.',
  );

  const [confirmReset, { isLoading }] = useConfirmPasswordResetMutation();

  useEffect(() => {
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const previousContent = existingMeta?.getAttribute('content') ?? null;
    const metaElement = existingMeta ?? document.createElement('meta');

    if (!existingMeta) {
      metaElement.setAttribute('name', 'referrer');
      document.head.appendChild(metaElement);
    }
    metaElement.setAttribute('content', 'no-referrer');

    return () => {
      if (existingMeta) {
        if (previousContent !== null) {
          existingMeta.setAttribute('content', previousContent);
        } else {
          existingMeta.removeAttribute('content');
        }
      } else {
        metaElement.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (hasTokenParam) {
      if (urlToken.length > 0) {
        setCapturedToken((prev) => prev ?? urlToken);
        setStatus('form');
        setStatusMessage(null);
      } else {
        setStatus('invalid');
        setStatusMessage('This password reset link is missing or invalid. Request a new link.');
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('token');
      setSearchParams(nextParams, { replace: true });
    }
  }, [hasTokenParam, urlToken, searchParams, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    setFieldErrors({});
    setGeneralError(null);

    if (!capturedToken) {
      setStatus('invalid');
      setStatusMessage('This password reset link is invalid or has expired. Request a new link.');
      return;
    }

    const errors: FieldErrors = {};
    const parsed = confirmPasswordResetRequestSchema.safeParse({
      token: capturedToken,
      newPassword,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'newPassword' && !errors.newPassword) {
          errors.newPassword = issue.message;
        }
      }
    }

    if (confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (errors.newPassword || errors.confirmPassword) {
      setFieldErrors(errors);
      return;
    }

    if (!parsed.success) {
      setStatus('invalid');
      setStatusMessage('This password reset link is invalid or has expired. Request a new link.');
      return;
    }

    try {
      const response = await confirmReset(parsed.data).unwrap();
      // Clear sensitive password and token state immediately upon completion
      setNewPassword('');
      setConfirmPassword('');
      setCapturedToken(null);
      setStatus('success');
      setStatusMessage(response.data.message);
    } catch (err: unknown) {
      setNewPassword('');
      setConfirmPassword('');

      const problem = extractProblemDetails(err);
      if (
        problem &&
        (problem.status === 400 || problem.code === 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN')
      ) {
        setCapturedToken(null);
        setStatus('invalid');
        setStatusMessage(
          problem.detail ||
            'This password reset link is invalid or has expired. Request a new link.',
        );
        return;
      }

      if (problem) {
        if (problem.errors && problem.errors.length > 0) {
          const mappedErrors: FieldErrors = {};
          for (const item of problem.errors) {
            if (item.pointer === '#/newPassword') {
              mappedErrors.newPassword = item.detail;
            }
          }
          setFieldErrors(mappedErrors);
        }
        setGeneralError(
          problem.detail || problem.title || 'Unable to reset your password. Please try again.',
        );
      } else {
        setGeneralError('An unexpected network error occurred. Please try again.');
      }
    }
  };

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-brand-line bg-white p-8 text-center shadow-sm"
        >
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">
            Password reset complete
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-muted">
            {statusMessage ??
              'Your password has been reset. You can now sign in with your new password.'}
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#12263b]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-xs"
        >
          <h1 className="text-2xl font-bold tracking-tight text-amber-950">
            Reset link invalid or expired
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            {statusMessage ??
              'This password reset link is invalid or has expired. Request a new link.'}
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/forgot-password"
              className="inline-flex items-center justify-center rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#12263b]"
            >
              Request a new link
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition hover:bg-brand-soft"
            >
              Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-brand-line bg-white p-8 shadow-xs">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            Enter a new password between 8 and 100 characters. Resetting your password signs out all
            active sessions.
          </p>
        </div>

        {generalError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label
              htmlFor="reset-new-password"
              className="block text-sm font-semibold text-brand-ink"
            >
              New Password
            </label>
            <input
              id="reset-new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={fieldErrors.newPassword ? 'true' : 'false'}
              aria-describedby={fieldErrors.newPassword ? 'reset-new-password-error' : undefined}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                fieldErrors.newPassword
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
            />
            {fieldErrors.newPassword && (
              <p
                id="reset-new-password-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {fieldErrors.newPassword}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="reset-confirm-password"
              className="block text-sm font-semibold text-brand-ink"
            >
              Confirm New Password
            </label>
            <input
              id="reset-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={fieldErrors.confirmPassword ? 'true' : 'false'}
              aria-describedby={
                fieldErrors.confirmPassword ? 'reset-confirm-password-error' : undefined
              }
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                fieldErrors.confirmPassword
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
            />
            {fieldErrors.confirmPassword && (
              <p
                id="reset-confirm-password-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#12263b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Resetting password...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
