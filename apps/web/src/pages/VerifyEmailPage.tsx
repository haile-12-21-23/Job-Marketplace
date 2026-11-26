import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { resendVerificationRequestSchema, type ProblemDetails } from '@jmp/contracts';
import { useResendVerificationMutation, useVerifyEmailMutation } from '../services/auth-api.js';

type VerificationStatus = 'idle' | 'loading' | 'success' | 'invalid' | 'error';

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

export default function VerifyEmailPage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const rawToken = searchParams.get('token')?.trim() ?? '';
  const hasToken = rawToken.length > 0;

  const [verifyStatus, setVerifyStatus] = useState<VerificationStatus>(
    hasToken ? 'loading' : 'idle',
  );
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const lastSubmittedTokenRef = useRef<string | null>(null);

  const [resendEmail, setResendEmail] = useState('');
  const [resendEmailError, setResendEmailError] = useState<string | null>(null);
  const [resendGeneralError, setResendGeneralError] = useState<string | null>(null);
  const [resendSuccessMessage, setResendSuccessMessage] = useState<string | null>(null);

  const [verifyEmail] = useVerifyEmailMutation();
  const [resendVerification, { isLoading: isResending }] = useResendVerificationMutation();

  const submitVerification = useCallback(
    async (token: string) => {
      setVerifyStatus('loading');
      setVerifyMessage(null);

      try {
        const response = await verifyEmail({ token }).unwrap();
        setVerifyStatus('success');
        setVerifyMessage(response.data.message);
      } catch (err: unknown) {
        const problem = extractProblemDetails(err);
        if (
          problem &&
          (problem.status === 400 ||
            problem.status === 422 ||
            problem.code === 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN' ||
            problem.code === 'VALIDATION_ERROR')
        ) {
          setVerifyStatus('invalid');
          setVerifyMessage(
            problem.detail ||
              'This verification link is invalid or has expired. Please request a new verification email.',
          );
        } else {
          setVerifyStatus('error');
          setVerifyMessage(
            problem?.detail ||
              'We could not verify your email due to an unexpected error. Please try again.',
          );
        }
      }
    },
    [verifyEmail],
  );

  useEffect(() => {
    if (!hasToken) {
      lastSubmittedTokenRef.current = null;
      setVerifyStatus('idle');
      setVerifyMessage(null);
      return;
    }

    if (lastSubmittedTokenRef.current === rawToken) {
      return;
    }

    lastSubmittedTokenRef.current = rawToken;
    void submitVerification(rawToken);
  }, [hasToken, rawToken, submitVerification]);

  const handleRetryVerification = () => {
    if (!hasToken || verifyStatus === 'loading') {
      return;
    }
    void submitVerification(rawToken);
  };

  const handleResendSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isResending) {
      return;
    }

    setResendEmailError(null);
    setResendGeneralError(null);
    setResendSuccessMessage(null);

    const parsed = resendVerificationRequestSchema.safeParse({ email: resendEmail });
    if (!parsed.success) {
      setResendEmailError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }

    try {
      const response = await resendVerification(parsed.data).unwrap();
      setResendSuccessMessage(response.data.message);
      setResendEmail('');
    } catch (err: unknown) {
      const problem = extractProblemDetails(err);
      if (problem) {
        if (problem.errors && problem.errors.length > 0) {
          const emailIssue = problem.errors.find((item) => item.pointer === '#/email');
          if (emailIssue) {
            setResendEmailError(emailIssue.detail);
          }
        }
        setResendGeneralError(
          problem.detail || problem.title || 'Unable to process your request. Please try again.',
        );
      } else {
        setResendGeneralError('An unexpected network error occurred. Please try again.');
      }
    }
  };

  if (verifyStatus === 'loading') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-brand-line bg-white p-8 text-center shadow-xs"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-line border-t-brand-teal"
          />
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">
            Verifying your email
          </h1>
          <p className="mt-2 text-sm text-brand-muted">
            Please wait while we confirm your verification link.
          </p>
        </div>
      </div>
    );
  }

  if (verifyStatus === 'success') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-brand-line bg-white p-8 text-center shadow-sm"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent text-brand-teal"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">Email verified</h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-muted">
            {verifyMessage ?? 'Your email address has been verified.'}
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#12263b]"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-brand-line bg-white p-8 shadow-xs">
        {verifyStatus === 'invalid' && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <h1 className="text-lg font-bold tracking-tight text-amber-950">
              Verification link invalid or expired
            </h1>
            <p className="mt-1 leading-relaxed">
              {verifyMessage ??
                'This verification link is invalid or has expired. Request a new verification email below.'}
            </p>
          </div>
        )}

        {verifyStatus === 'error' && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <h1 className="text-lg font-bold tracking-tight text-red-950">
              Unable to verify email
            </h1>
            <p className="mt-1 leading-relaxed">
              {verifyMessage ??
                'We could not verify your email due to an unexpected error. Please try again.'}
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleRetryVerification}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {verifyStatus === 'idle' && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy">
              Verify your email address
            </h1>
            <p className="mt-1 text-sm text-brand-muted">
              Enter your email address below to request a new verification link.
            </p>
          </div>
        )}

        <div className="border-t border-brand-line pt-6 first:border-t-0 first:pt-0">
          <h2 className="text-base font-semibold text-brand-navy">Resend verification email</h2>
          <p className="mt-1 text-xs text-brand-muted">
            We will send a new single-use verification link if an unverified account exists.
          </p>

          {resendSuccessMessage && (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
            >
              {resendSuccessMessage}
            </div>
          )}

          {resendGeneralError && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {resendGeneralError}
            </div>
          )}

          <form onSubmit={handleResendSubmit} noValidate className="mt-4 space-y-4">
            <div>
              <label htmlFor="resend-email" className="block text-sm font-semibold text-brand-ink">
                Email Address
              </label>
              <input
                id="resend-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                aria-invalid={resendEmailError ? 'true' : 'false'}
                aria-describedby={resendEmailError ? 'resend-email-error' : undefined}
                className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                  resendEmailError
                    ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                    : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
                }`}
                placeholder="name@example.com"
              />
              {resendEmailError && (
                <p
                  id="resend-email-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600"
                >
                  {resendEmailError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isResending}
              className="flex w-full items-center justify-center rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#12263b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResending ? 'Sending verification email...' : 'Send Verification Email'}
            </button>
          </form>
        </div>

        <div className="mt-6 border-t border-brand-line pt-4 text-center">
          <Link to="/register" className="text-xs font-semibold text-brand-teal hover:underline">
            Need a new account? Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
