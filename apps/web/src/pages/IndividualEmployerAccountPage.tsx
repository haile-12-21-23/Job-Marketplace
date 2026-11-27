import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  updateIndividualEmployerProfileRequestSchema,
  type ProblemDetails,
  type UpdateIndividualEmployerProfileRequest,
} from '@jmp/contracts';
import {
  useGetIndividualEmployerAccountQuery,
  useUpdateIndividualEmployerProfileMutation,
} from '../services/employer-api.js';

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

export default function IndividualEmployerAccountPage(): React.JSX.Element {
  const { employerAccountId = '' } = useParams<{ employerAccountId: string }>();

  const {
    data: accountResponse,
    isLoading: isFetching,
    isError: hasFetchError,
    error: fetchError,
  } = useGetIndividualEmployerAccountQuery(employerAccountId, {
    skip: employerAccountId.trim() === '',
  });

  const [updateProfile, { isLoading: isUpdating }] = useUpdateIndividualEmployerProfileMutation();

  const [publicName, setPublicName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [city, setCity] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const account = accountResponse?.data;

  useEffect(() => {
    if (account) {
      setPublicName(account.profile.publicName);
      setContactPhone(account.profile.contactPhone ?? '');
      setCountryCode(account.profile.countryCode ?? '');
      setCity(account.profile.city ?? '');
    }
  }, [account]);

  if (employerAccountId.trim() === '' || hasFetchError) {
    const problem = extractProblemDetails(fetchError);
    const errorMessage =
      problem?.detail ||
      'Employer account not found or you do not have permission to view this account.';

    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-white p-6 sm:p-8 shadow-xs"
        >
          <h1 className="text-xl font-bold text-brand-navy">Employer Account Unavailable</h1>
          <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/app"
              className="rounded-lg border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-slate-50"
            >
              Back to Workspace
            </Link>
            <Link
              to="/app/employer-accounts/new"
              className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-[#12263b]"
            >
              Create Individual Employer Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isFetching || !account) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-brand-line bg-white p-8 text-center text-sm text-brand-muted shadow-xs"
        >
          Loading employer account...
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isUpdating) {
      return;
    }

    setFieldErrors({});
    setGeneralError(null);
    setSaveSuccessMessage(null);

    const nextPublicName = publicName.trim();
    const nextPhone = contactPhone.trim() === '' ? null : contactPhone.trim();
    const nextCountry = countryCode.trim() === '' ? null : countryCode.trim().toUpperCase();
    const nextCity = city.trim() === '' ? null : city.trim();

    const patchPayload: UpdateIndividualEmployerProfileRequest = {};
    if (nextPublicName !== account.profile.publicName) {
      patchPayload.publicName = nextPublicName;
    }
    if (nextPhone !== account.profile.contactPhone) {
      patchPayload.contactPhone = nextPhone;
    }
    if (nextCountry !== account.profile.countryCode) {
      patchPayload.countryCode = nextCountry;
    }
    if (nextCity !== account.profile.city) {
      patchPayload.city = nextCity;
    }

    const validation = updateIndividualEmployerProfileRequestSchema.safeParse(patchPayload);
    if (!validation.success) {
      const issues: FieldErrors = {};
      let rootMessage: string | null = null;
      for (const issue of validation.error.issues) {
        const key = issue.path[0] as keyof FieldErrors | undefined;
        if (key && !issues[key]) {
          issues[key] = issue.message;
        } else if (!key && !rootMessage) {
          rootMessage = issue.message;
        }
      }
      setFieldErrors(issues);
      if (rootMessage) {
        setGeneralError(rootMessage);
      }
      return;
    }

    try {
      await updateProfile({
        employerAccountId: account.id,
        body: validation.data,
      }).unwrap();
      setSaveSuccessMessage('Profile updated successfully.');
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
          problem.detail || problem.title || 'Could not update individual employer profile.',
        );
      } else {
        setGeneralError('An unexpected network error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div>
        <Link to="/app" className="text-xs font-semibold text-brand-teal hover:underline">
          &larr; Back to Workspace
        </Link>
      </div>

      <section className="rounded-2xl border border-brand-line bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-line pb-5">
          <div>
            <span className="inline-block rounded-md bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-teal">
              {account.type} Employer Account
            </span>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-navy">
              {account.profile.publicName}
            </h1>
            <p className="mt-1 text-xs font-mono text-brand-muted">ID: {account.id}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 border border-emerald-200">
              Status: {account.status}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800 border border-amber-200">
              Verification: {account.verificationStatus}
            </span>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-brand-muted">
          Your individual employer account is active with status{' '}
          <strong className="font-semibold text-brand-navy">{account.verificationStatus}</strong>.
          Verification evidence and job publishing remain disabled until verification is completed
          in later stories.
        </p>
      </section>

      <section className="rounded-2xl border border-brand-line bg-white p-6 sm:p-8 shadow-xs">
        <h2 className="text-lg font-bold text-brand-navy">Edit Individual Profile</h2>
        <p className="mt-1 text-xs text-brand-muted">
          Account owners can update profile contact and location details below.
        </p>

        {saveSuccessMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800"
          >
            {saveSuccessMessage}
          </div>
        )}

        {generalError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
          >
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
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
              Contact Phone
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
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
                Country Code
              </label>
              <input
                id="countryCode"
                name="countryCode"
                type="text"
                maxLength={2}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
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
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
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

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdating}
              className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-[#12263b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdating ? 'Saving changes...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
