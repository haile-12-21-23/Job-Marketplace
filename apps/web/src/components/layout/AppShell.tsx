export default function AppShell(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <a
            href="/"
            aria-label="Job Marketplace home"
            className="flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              JM
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Job Marketplace
            </span>
          </a>

          {/* Placeholder nav — no functional links yet (JMP-30) */}
          <nav aria-label="Primary navigation">
            <ul className="flex list-none gap-1 p-0">
              {(['Jobs', 'Companies', 'For Employers'] as const).map((item) => (
                <li key={item}>
                  <span
                    aria-disabled="true"
                    title="Coming in a future release"
                    className="cursor-default rounded-md px-3 py-2 text-sm text-slate-400 select-none"
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────── */}
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-10 px-4 py-20 sm:px-6 lg:px-8"
      >
        {/* Hero */}
        <div className="max-w-2xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"
            />
            Foundation ready · Sprint 1
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Find your next opportunity
          </h1>

          <p className="text-lg leading-relaxed text-slate-600">
            The Job Marketplace frontend foundation is live. Product modules —
            job search, employer dashboards, and candidate profiles — will be
            introduced in upcoming implementation tasks.
          </p>
        </div>

        {/* Status cards */}
        <dl className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              {
                label: 'React + Vite',
                value: 'Ready',
                description: 'TypeScript strict mode',
              },
              {
                label: 'Tailwind CSS',
                value: 'Active',
                description: 'Utility-first styling',
              },
              {
                label: 'Error Boundary',
                value: 'Mounted',
                description: 'Global render guard',
              },
            ] as const
          ).map(({ label, value, description }) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-5"
            >
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </dt>
              <dd className="text-2xl font-bold text-blue-600">{value}</dd>
              <dd className="text-sm text-slate-500">{description}</dd>
            </div>
          ))}
        </dl>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 py-6">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-slate-500 sm:px-6 lg:px-8">
          &copy; {new Date().getFullYear()} Job Marketplace · Sprint 1 —
          Project Foundation
        </div>
      </footer>
    </div>
  );
}
