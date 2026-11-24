import React from 'react';

/**
 * Controlled development-only error trigger.
 * In development, visiting `?simulate-error=1` exercises the AppErrorBoundary fallback.
 * In production builds, `import.meta.env.DEV` is statically replaced with `false`
 * and this code is eliminated via dead-code elimination.
 */
function DevErrorTrigger(): React.JSX.Element | null {
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('simulate-error')
  ) {
    throw new Error(
      'Simulated development render error for AppErrorBoundary verification.',
    );
  }
  return null;
}

export default function AppShell(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1d3448]">
      <DevErrorTrigger />

      {/* ── Skip to Main Content Link ────────────────────────── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-[#17324d] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-[#16847f] focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* ── Header / Appbar ──────────────────────────────────── */}
      <header className="border-b border-[#d4dee7] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand Wordmark matching JMP UX Baseline */}
          <a
            href="/"
            aria-label="Job Marketplace home"
            className="flex items-center gap-2 rounded-md text-xl font-extrabold tracking-tight text-[#17324d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#16847f]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#17324d] text-sm font-bold text-white shadow-xs">
              <span>j</span>
              <span className="text-[#78c9be]">m</span>
            </span>
            <span>
              job<i className="not-italic text-[#16847f]">market</i>
            </span>
          </a>

          {/* Desktop Navigation links — explicitly non-functional placeholders for JMP-25 */}
          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1 md:flex"
          >
            {(
              [
                { label: 'Find jobs', id: 'jobs' },
                { label: 'For employers', id: 'employers' },
                { label: 'Career resources', id: 'resources' },
              ] as const
            ).map(({ label, id }) => (
              <span
                key={id}
                aria-disabled="true"
                title="Navigation enabled in JMP-30"
                className="cursor-default rounded-md px-3 py-2 text-sm font-medium text-[#657789] select-none hover:text-[#1d3448]"
              >
                {label}
              </span>
            ))}
          </nav>

          {/* User actions / auth placeholders */}
          <div className="flex items-center gap-2">
            <span
              aria-disabled="true"
              title="Authentication enabled in future sprint"
              className="hidden cursor-default rounded-lg border border-[#d4dee7] bg-white px-3 py-1.5 text-xs font-semibold text-[#17324d] select-none sm:inline-block"
            >
              Sign in
            </span>
            <span
              aria-disabled="true"
              title="Registration enabled in future sprint"
              className="cursor-default rounded-lg bg-[#17324d] px-3.5 py-1.5 text-xs font-semibold text-white select-none shadow-xs"
            >
              Create account
            </span>
          </div>
        </div>

        {/* Mobile secondary navigation preview */}
        <div className="flex border-t border-[#d4dee7] px-4 py-2 md:hidden">
          <ul className="flex list-none gap-2 p-0 text-xs text-[#657789]">
            {(['Find jobs', 'For employers', 'Resources'] as const).map(
              (item) => (
                <li key={item}>
                  <span
                    aria-disabled="true"
                    title="Navigation enabled in JMP-30"
                    className="cursor-default rounded px-2 py-1 select-none"
                  >
                    {item}
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      </header>

      {/* ── Main Content Landmark ────────────────────────────── */}
      <main id="main-content" className="flex-1">
        {/* Hero Section */}
        <section
          aria-labelledby="hero-heading"
          className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        >
          <div className="rounded-2xl border border-[#d4dee7] bg-[#f4f7fa] p-6 sm:p-10 lg:p-12">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#b9d8d4] bg-[#e8f3f1] px-3 py-1 text-xs font-bold tracking-wider text-[#126761] uppercase">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[#16847f]"
                />
                Foundation ready · Sprint 1
              </div>

              <h1
                id="hero-heading"
                className="text-3xl font-extrabold tracking-tight text-[#17324d] sm:text-4xl lg:text-5xl"
              >
                Work that moves your life forward.
              </h1>

              <p className="text-base leading-relaxed text-[#657789] sm:text-lg">
                The Job Marketplace frontend foundation is live. Built with
                React, Vite, strict TypeScript, and Tailwind CSS. Discovery, job
                search, candidate profiles, and employer management modules will
                be introduced in upcoming implementation sprints.
              </p>
            </div>

            {/* Non-functional Search Preview (Visual wireframe alignment) */}
            <div
              aria-label="Job search preview"
              className="mt-8 flex flex-col gap-2 rounded-xl border border-[#c8d5df] bg-white p-2 shadow-xs sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-center px-3 py-2 text-sm text-[#758695]">
                <span aria-hidden="true" className="mr-2 text-base">
                  ⌕
                </span>
                <span className="select-none">
                  Job title, skill or company…
                </span>
              </div>
              <div className="hidden h-6 w-px bg-[#d4dee7] sm:block" />
              <div className="flex flex-1 items-center px-3 py-2 text-sm text-[#758695]">
                <span aria-hidden="true" className="mr-2 text-base">
                  ⌖
                </span>
                <span className="select-none">City, country or remote…</span>
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Search functional in JMP-30"
                className="cursor-not-allowed rounded-lg bg-[#16847f] px-5 py-2.5 text-sm font-semibold text-white opacity-85 select-none"
              >
                Search jobs
              </button>
            </div>

            {/* Foundation Statistics / Status Cards */}
            <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  {
                    label: 'React + Vite',
                    value: 'Ready',
                    description: 'Strict TypeScript & ESM build',
                  },
                  {
                    label: 'Tailwind CSS v4',
                    value: 'Active',
                    description: 'Utility styling & brand tokens',
                  },
                  {
                    label: 'Error Boundary',
                    value: 'Mounted',
                    description: 'Global rendering recovery guard',
                  },
                ] as const
              ).map(({ label, value, description }) => (
                <div
                  key={label}
                  className="flex flex-col gap-1 rounded-xl border border-[#d4dee7] bg-white p-5 shadow-xs"
                >
                  <dt className="text-xs font-bold uppercase tracking-wider text-[#657789]">
                    {label}
                  </dt>
                  <dd className="text-2xl font-extrabold text-[#16847f]">
                    {value}
                  </dd>
                  <dd className="text-xs text-[#657789]">{description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Categories Preview Section (IA alignment) */}
        <section
          aria-labelledby="categories-heading"
          className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h2
              id="categories-heading"
              className="text-lg font-bold text-[#17324d]"
            >
              Explore by category
            </h2>
            <span className="text-xs text-[#657789]">
              Planned for future sprints
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(
              [
                {
                  title: 'Technology',
                  desc: 'Software engineering, cloud and data roles',
                },
                {
                  title: 'Business & Finance',
                  desc: 'Operations, accounting and management',
                },
                {
                  title: 'Engineering',
                  desc: 'Infrastructure, mechanical and electrical',
                },
              ] as const
            ).map(({ title, desc }) => (
              <div
                key={title}
                className="rounded-xl border border-[#d4dee7] bg-white p-4 shadow-xs"
              >
                <h3 className="text-sm font-bold text-[#17324d]">{title}</h3>
                <p className="mt-1 text-xs text-[#657789]">{desc}</p>
                <span className="mt-3 inline-block rounded-md bg-[#f4f7fa] px-2 py-0.5 text-[10px] font-medium text-[#657789]">
                  Foundation preview
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-[#d4dee7] bg-[#f4f7fa] py-8 text-center text-xs text-[#657789]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="font-medium text-[#17324d]">
            job<i className="not-italic text-[#16847f]">market</i> — Job
            Marketplace Platform
          </p>
          <p className="mt-1">
            Sprint 1: Project Foundation (JMP-25) · Strictly typed React, Vite,
            and Tailwind CSS architecture.
          </p>
          <p className="mt-2 text-[#657789]">
            &copy; {new Date().getFullYear()} Job Marketplace. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
