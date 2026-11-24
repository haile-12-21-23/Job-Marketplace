import React from 'react';
import { NavLink, Outlet, Link } from 'react-router';

export default function AuthenticatedLayout(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-brand-ink">
      {/* Top Banner clearly identifying this as a future authenticated-area placeholder */}
      <div
        role="region"
        aria-label="Placeholder notice"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800"
      >
        <span className="font-bold">Authenticated Area Placeholder:</span> This area simulates the
        future candidate & employer workspace. Authentication, sessions, and route guards will be
        enabled in a future sprint.
      </div>

      {/* Workspace Header */}
      <header className="border-b border-brand-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              to="/app"
              aria-label="Job Marketplace Workspace"
              className="flex items-center gap-2 text-lg font-bold text-brand-navy"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-teal text-xs font-bold text-white shadow-xs">
                W
              </span>
              <span>Workspace</span>
            </Link>

            <nav aria-label="Workspace navigation" className="hidden items-center gap-2 sm:flex">
              <NavLink
                to="/app"
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? 'bg-brand-soft font-semibold text-brand-teal'
                      : 'text-brand-muted hover:text-brand-ink'
                  }`
                }
              >
                Dashboard
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-lg border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy shadow-xs hover:bg-slate-50 transition"
            >
              Back to Public Site
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#d4dee7] bg-white py-6 text-center text-xs text-[#657789]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="font-medium text-[#17324d]">Job Marketplace Workspace (Placeholder)</p>
          <p className="mt-1 text-[11px] text-[#657789]">
            Protected routes, authorization tokens, and user state are intentionally not implemented
            here.
          </p>
        </div>
      </footer>
    </div>
  );
}
