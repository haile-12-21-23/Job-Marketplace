import React, { useState } from 'react';
import { Link } from 'react-router';
import { requestPasswordResetRequestSchema, type ProblemDetails } from '@jmp/contracts';
import { useRequestPasswordResetMutation } from '../services/auth-api.js';

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

export default function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [requestReset, { isLoading }] = useRequestPasswordResetMutation();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    setEmailError(null);
    setGeneralError(null);
    setSuccessMessage(null);

    const parsed = requestPasswordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }

    try {
      const response = await requestReset(parsed.data).unwrap();
      setSuccessMessage(response.data.message);
      setEmail('');
    } catch (err: unknown) {
      const problem = extractProblemDetails(err);
      if (problem) {
        if (problem.status === 429 || problem.code === 'RATE_LIMIT_EXCEEDED') {
          setGeneralError(
            problem.detail || 'Too many password reset requests. Please try again later.',
          );
          return;
        }
        if (problem.errors && problem.errors.length > 0) {
          const emailIssue = problem.errors.find((item) => item.pointer === '#/email');
          if (emailIssue) {
            setEmailError(emailIssue.detail);
          }
        }
        setGeneralError(
          problem.detail || problem.title || 'Unable to process your request. Please try again.',
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
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">Reset your password</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Enter your email address and we will send instructions to reset your password if an
            active account matches.
          </p>
        </div>

        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            {successMessage}
          </div>
        )}

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
            <label htmlFor="forgot-email" className="block text-sm font-semibold text-brand-ink">
              Email Address
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailError ? 'true' : 'false'}
              aria-describedby={emailError ? 'forgot-email-error' : undefined}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                emailError
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
              placeholder="name@example.com"
            />
            {emailError && (
              <p
                id="forgot-email-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {emailError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#12263b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Sending reset instructions...' : 'Send Reset Instructions'}
          </button>
        </form>

        <div className="mt-6 border-t border-brand-line pt-4 text-center text-xs text-brand-muted">
          <p>
            Remembered your password?{' '}
            <Link to="/login" className="font-semibold text-brand-teal hover:underline">
              Back to Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
