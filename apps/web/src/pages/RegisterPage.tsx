import React, { useState } from 'react';
import { Link } from 'react-router';
import { registerRequestSchema, type ProblemDetails } from '@jmp/contracts';
import { useRegisterMutation } from '../services/auth-api.js';

interface FieldErrors {
  displayName?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
}

export default function RegisterPage(): React.JSX.Element {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const [registerUser, { isLoading }] = useRegisterMutation();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Prevent duplicate submission while already processing
    if (isLoading) {
      return;
    }

    setFieldErrors({});
    setGeneralError(null);

    // Client-side validation using shared contract schema
    const validationResult = registerRequestSchema.safeParse({
      displayName,
      email,
      password,
    });

    if (!validationResult.success) {
      const issues: FieldErrors = {};
      for (const issue of validationResult.error.issues) {
        const fieldName = issue.path[0] as keyof FieldErrors;
        if (fieldName && !issues[fieldName]) {
          issues[fieldName] = issue.message;
        }
      }
      setFieldErrors(issues);
      return;
    }

    try {
      await registerUser(validationResult.data).unwrap();
      setIsSuccess(true);
      // Clear sensitive form state after successful submission
      setPassword('');
      setDisplayName('');
      setEmail('');
    } catch (err: unknown) {
      // Clear password on failed attempt as sensitive state
      setPassword('');

      if (
        typeof err === 'object' &&
        err !== null &&
        'data' in err &&
        typeof (err as { data: unknown }).data === 'object' &&
        (err as { data: unknown }).data !== null
      ) {
        const problem = (err as { data: ProblemDetails }).data;
        if (problem.errors && problem.errors.length > 0) {
          const errors: FieldErrors = {};
          for (const item of problem.errors) {
            if (item.pointer === '#/email') {
              errors.email = item.detail;
            } else if (item.pointer === '#/displayName') {
              errors.displayName = item.detail;
            } else if (item.pointer === '#/password') {
              errors.password = item.detail;
            }
          }
          setFieldErrors(errors);
        }
        setGeneralError(
          problem.detail || problem.title || 'Registration failed. Please check your input.',
        );
      } else {
        setGeneralError('An unexpected network error occurred. Please try again.');
      }
    }
  };

  if (isSuccess) {
    return (
      <main id="main-content" className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-brand-line bg-white p-8 shadow-sm text-center"
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
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">
            Registration successful
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-muted">
            Your account has been created. Email verification is required before accessing protected
            features. Please check your inbox for verification instructions.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-[#12263b] transition"
            >
              Back to Home
            </Link>
            <Link
              to="/verify-email"
              className="inline-flex items-center justify-center rounded-lg border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-soft transition"
            >
              Resend verification email
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto max-w-lg px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-brand-line bg-white p-8 shadow-xs">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">Create your account</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Join the Job Marketplace to discover opportunities and manage recruitment.
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
          {/* Display Name field */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-semibold text-brand-ink">
              Full Name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={fieldErrors.displayName ? 'true' : 'false'}
              aria-describedby={fieldErrors.displayName ? 'displayName-error' : undefined}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                fieldErrors.displayName
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
              placeholder="e.g. Almaz Bekele"
            />
            {fieldErrors.displayName && (
              <p
                id="displayName-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {fieldErrors.displayName}
              </p>
            )}
          </div>

          {/* Email field */}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-brand-ink">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldErrors.email ? 'true' : 'false'}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                fieldErrors.email
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
              placeholder="name@example.com"
            />
            {fieldErrors.email && (
              <p id="email-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password field */}
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-brand-ink">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? 'true' : 'false'}
              aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-brand-ink shadow-xs focus:outline-none ${
                fieldErrors.password
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-brand-line focus:border-brand-teal focus:ring-1 focus:ring-brand-teal'
              }`}
            />
            {fieldErrors.password ? (
              <p
                id="password-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {fieldErrors.password}
              </p>
            ) : (
              <p id="password-hint" className="mt-1 text-xs text-brand-muted">
                Must be at least 8 characters.
              </p>
            )}
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-brand-navy py-2.5 px-4 text-sm font-semibold text-white shadow-xs hover:bg-[#12263b] disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  />
                  <span>Creating account...</span>
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-brand-line pt-4 text-center">
          <p className="text-xs text-brand-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-navy hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
