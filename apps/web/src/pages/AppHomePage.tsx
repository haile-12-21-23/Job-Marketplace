import React from 'react';
import { Link } from 'react-router';

export default function AppHomePage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-brand-line bg-white p-6 sm:p-8 shadow-xs">
        <div className="max-w-2xl space-y-3">
          <span className="inline-block rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            Sprint Foundation · Route Placeholder
          </span>
          <h1 className="text-2xl font-extrabold text-brand-navy sm:text-3xl">
            Candidate & Employer Workspace
          </h1>
          <p className="text-sm leading-relaxed text-brand-muted">
            This page represents the authenticated-area placeholder under the{' '}
            <code className="font-mono text-brand-teal">/app</code> route hierarchy. Authentication,
            user identity, permission checks, and real workflows will be wired in future development
            sprints.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              title: 'Applications Tracking',
              desc: 'Monitor candidate submission status and interview timelines.',
            },
            {
              title: 'Job Postings Management',
              desc: 'Create, update, and manage open positions for employers.',
            },
            {
              title: 'Profile & Documents',
              desc: 'Manage resumes, portfolio links, and company profiles.',
            },
          ].map(({ title, desc }) => (
            <div
              key={title}
              className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"
            >
              <h2 className="text-sm font-bold text-brand-navy">{title}</h2>
              <p className="mt-1 text-xs text-brand-muted">{desc}</p>
              <span className="mt-3 inline-block rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                Future sprint feature
              </span>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-brand-line pt-4">
          <Link to="/" className="text-xs font-semibold text-brand-teal hover:underline">
            &larr; Return to public home
          </Link>
        </div>
      </div>
    </div>
  );
}
