import React from 'react';
import { NavLink, Outlet, Link } from 'react-router';

export default function PublicLayout(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-white text-brand-ink">
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-[#17324d] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-[#16847f] focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Header / Appbar */}
      <header className="border-b border-brand-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand Wordmark */}
          <Link
            to="/"
            aria-label="Job Marketplace home"
            className="flex items-center gap-2 rounded-md text-xl font-extrabold tracking-tight text-brand-navy focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-brand-teal"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy text-sm font-bold text-white shadow-xs">
              <span>j</span>
              <span className="text-[#78c9be]">m</span>
            </span>
            <span>
              job<i className="not-italic text-brand-teal">market</i>
            </span>
          </Link>

          {/* Navigation Links */}
          <nav aria-label="Primary navigation" className="hidden items-center gap-2 md:flex">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-soft font-semibold text-brand-teal'
                    : 'text-brand-muted hover:text-brand-ink'
                }`
              }
            >
              Find jobs
            </NavLink>
            <NavLink
              to="/app"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-soft font-semibold text-brand-teal'
                    : 'text-brand-muted hover:text-brand-ink'
                }`
              }
            >
              Workspace (App)
            </NavLink>
          </nav>

          {/* User actions / auth placeholders */}
          <div className="flex items-center gap-2">
            <Link
              to="/register"
              className="rounded-lg border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy hover:bg-brand-soft transition"
            >
              Register
            </Link>
            <span
              aria-disabled="true"
              title="Authentication enabled in future sprint"
              className="hidden cursor-default rounded-lg border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy select-none sm:inline-block"
            >
              Sign in
            </span>
            <Link
              to="/app"
              className="rounded-lg bg-brand-navy px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#12263b] transition"
            >
              Go to Workspace
            </Link>
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="flex border-t border-brand-line px-4 py-2 md:hidden">
          <ul className="flex list-none gap-3 p-0 text-xs">
            <li>
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded px-2 py-1 ${isActive ? 'font-bold text-brand-teal' : 'text-brand-muted'}`
                }
              >
                Find jobs
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/app"
                className={({ isActive }) =>
                  `rounded px-2 py-1 ${isActive ? 'font-bold text-brand-teal' : 'text-brand-muted'}`
                }
              >
                Workspace (App)
              </NavLink>
            </li>
          </ul>
        </div>
      </header>

      {/* Main Outlet */}
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#d4dee7] bg-[#f4f7fa] py-8 text-center text-xs text-[#657789]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="font-medium text-[#17324d]">
            job<i className="not-italic text-[#16847f]">market</i> — Job Marketplace Platform
          </p>
          <p className="mt-1">
            Sprint 1: Frontend Foundation (JMP-30) · React Router, Redux Toolkit, and RTK Query.
          </p>
          <p className="mt-2 text-[#657789]">
            &copy; {new Date().getFullYear()} Job Marketplace. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
