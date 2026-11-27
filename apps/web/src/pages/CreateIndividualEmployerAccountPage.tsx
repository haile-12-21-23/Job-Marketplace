import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { createIndividualEmployerAccountRequestSchema, type ProblemDetails } from '@jmp/contracts';
import { useCreateIndividualEmployerAccountMutation } from '../services/employer-api.js';

interface FieldErrors {
  publicName?: string | undefined;
  contactPhone?: string | undefined;
  countryCode?: string | undefined;
  city?: string | undefined;
}

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

export default function CreateIndividualEmployerAccountPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [publicName, setPublicName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [city, setCity] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [createAccount, { isLoading }] = useCreateIndividualEmployerAccountMutation();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    setFieldErrors({});
    setGeneralError(null);

    const trimmedPhone = contactPhone.trim();
    const trimmedCountry = countryCode.trim();
    const trimmedCity = city.trim();

    const candidatePayload = {
      publicName,
      ...(trimmedPhone !== '' ? { contactPhone: trimmedPhone } : {}),
      ...(trimmedCountry !== '' ? { countryCode: trimmedCountry } : {}),
      ...(trimmedCity !== '' ? { city: trimmedCity } : {}),
    };

    const validation = createIndividualEmployerAccountRequestSchema.safeParse(candidatePayload);
    if (!validation.success) {
      const issues: FieldErrors = {};
      for (const issue of validation.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !issues[key]) {
          issues[key] = issue.message;
        }
      }
      setFieldErrors(issues);
      return;
    }

    try {
      const response = await createAccount(validation.data).unwrap();
      navigate(`/app/employer-accounts/${response.data.id}`);
    } catch (err: unknown) {
      const problem = extractProblemDetails(err);
      if (problem) {
        if (problem.errors && problem.errors.length > 0) {
          const serverFieldErrors: FieldErrors = {};
          for (const item of problem.errors) {
            if (item.pointer === '#/publicName') {
              serverFieldErrors.publicName = item.detail;
            } else if (item.pointer === '#/contactPhone') {
              serverFieldErrors.contactPhone = item.detail;
            } else if (item.pointer === '#/countryCode') {
              serverFieldErrors.countryCode = item.detail;
            } else if (item.pointer === '#/city') {
              serverFieldErrors.city = item.detail;
            }
          }
          setFieldErrors(serverFieldErrors);
        }
        setGeneralError(
          problem.detail || problem.title || 'Could not create individual employer account.',
        );
      } else {
        setGeneralError('An unexpected network error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Link to="/app" className="text-xs font-semibold text-brand-teal hover:underline">
          &larr; Back to Workspace
        </Link>
      </div>

      <div className="rounded-2xl border border-brand-line bg-white p-6 sm:p-8 shadow-xs">
        <div className="mb-6">
          <span className="inline-block rounded-md bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-teal">
            Individual Employer Account
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-navy">
            Create Individual Employer Account
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            Set up your personal hiring profile. Accounts start active and unverified until identity
            verification is completed in a later step.
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
            <label htmlFor="publicName" className="block text-sm font-semibold text-brand-navy">
              Public Name <span className="text-red-600">*</span>
            </label>
            <input
              id="publicName"
              name="publicName"
              type="text"
              required
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              placeholder="e.g. Abebe Bikila Recruitment"
              aria-invalid={Boolean(fieldErrors.publicName)}
              aria-describedby={fieldErrors.publicName ? 'publicName-error' : undefined}
              className="mt-1.5 block w-full rounded-lg border border-brand-line px-3.5 py-2 text-sm text-brand-ink shadow-xs focus:border-brand-teal focus:outline-hidden focus:ring-2 focus:ring-brand-teal/20"
            />
            {fieldErrors.publicName && (
              <p id="publicName-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.publicName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="contactPhone" className="block text-sm font-semibold text-brand-navy">
              Contact Phone <span className="text-xs font-normal text-brand-muted">(optional)</span>
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+251 911 000000"
              aria-invalid={Boolean(fieldErrors.contactPhone)}
              aria-describedby={fieldErrors.contactPhone ? 'contactPhone-error' : undefined}
              className="mt-1.5 block w-full rounded-lg border border-brand-line px-3.5 py-2 text-sm text-brand-ink shadow-xs focus:border-brand-teal focus:outline-hidden focus:ring-2 focus:ring-brand-teal/20"
            />
            {fieldErrors.contactPhone && (
              <p id="contactPhone-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.contactPhone}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="countryCode" className="block text-sm font-semibold text-brand-navy">
                Country Code{' '}
                <span className="text-xs font-normal text-brand-muted">
                  (optional ISO 2-letter)
                </span>
              </label>
              <input
                id="countryCode"
                name="countryCode"
                type="text"
                maxLength={2}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                placeholder="ET"
                aria-invalid={Boolean(fieldErrors.countryCode)}
                aria-describedby={fieldErrors.countryCode ? 'countryCode-error' : undefined}
                className="mt-1.5 block w-full rounded-lg border border-brand-line px-3.5 py-2 text-sm uppercase text-brand-ink shadow-xs focus:border-brand-teal focus:outline-hidden focus:ring-2 focus:ring-brand-teal/20"
              />
              {fieldErrors.countryCode && (
                <p id="countryCode-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.countryCode}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="city" className="block text-sm font-semibold text-brand-navy">
                City <span className="text-xs font-normal text-brand-muted">(optional)</span>
              </label>
              <input
                id="city"
                name="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Addis Ababa"
                aria-invalid={Boolean(fieldErrors.city)}
                aria-describedby={fieldErrors.city ? 'city-error' : undefined}
                className="mt-1.5 block w-full rounded-lg border border-brand-line px-3.5 py-2 text-sm text-brand-ink shadow-xs focus:border-brand-teal focus:outline-hidden focus:ring-2 focus:ring-brand-teal/20"
              />
              {fieldErrors.city && (
                <p id="city-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.city}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              to="/app"
              className="rounded-lg border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-[#12263b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Creating account...' : 'Create Individual Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
