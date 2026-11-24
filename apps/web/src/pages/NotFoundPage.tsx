import React from 'react';
import { Link } from 'react-router';

export default function NotFoundPage(): React.JSX.Element {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold text-brand-navy">
        404
      </div>
      <h1 className="mt-4 text-2xl font-extrabold text-brand-navy">Page not found</h1>
      <p className="mt-2 text-sm text-brand-muted">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="mt-6">
        <Link
          to="/"
          className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#126761] transition"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}
