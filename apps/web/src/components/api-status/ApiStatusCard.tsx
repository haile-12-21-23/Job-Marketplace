import React from 'react';
import { useGetServiceStatusQuery } from '../../services/base-api.js';

export function ApiStatusCard(): React.JSX.Element {
  const { data, error, isLoading, isFetching, refetch } = useGetServiceStatusQuery();

  return (
    <div
      data-testid="api-status-card"
      className="mt-8 rounded-xl border border-[#c8d5df] bg-white p-6 shadow-xs"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#e2e8f0] pb-4">
        <div>
          <h2 className="text-base font-bold text-[#17324d]">API Service Status</h2>
          <p className="text-xs text-[#657789]">
            Live connection query via RTK Query (
            <code className="font-mono text-[#16847f]">GET /api/v1</code>)
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isLoading || isFetching}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-[#c8d5df] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[#17324d] transition hover:bg-slate-100 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isFetching ? 'Refreshing…' : 'Refetch'}
        </button>
      </div>

      <div className="mt-4">
        {isLoading && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 py-3 text-sm text-[#657789]"
          >
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-[#16847f] border-t-transparent"
            />
            <span>Connecting to API service...</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">API Connection Unavailable</p>
                <p className="mt-1 text-xs text-red-700">
                  Unable to connect to the Job Marketplace API. Ensure the backend server is
                  running.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="self-start sm:self-auto shrink-0 rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-800 cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {data && !isLoading && !error && (
          <div
            data-testid="api-status-success"
            className="rounded-lg border border-[#b9d8d4] bg-[#f0f8f7] p-4 text-sm text-[#126761]"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  <span className="font-bold text-[#17324d]">{data.data.service}</span>
                </div>
                <div className="text-xs text-[#657789]">
                  API Version:{' '}
                  <span className="font-semibold text-[#17324d]">{data.data.version}</span>
                  {' · '}
                  Status:{' '}
                  <span className="font-semibold uppercase tracking-wider text-emerald-700">
                    {data.data.status}
                  </span>
                </div>
              </div>
              <span className="self-start sm:self-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                Connected
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
