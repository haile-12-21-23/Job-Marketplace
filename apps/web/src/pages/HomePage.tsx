import React from 'react';
import { ApiStatusCard } from '../components/api-status/ApiStatusCard.js';

export default function HomePage(): React.JSX.Element {
  return (
    <div>
      {/* Hero Section */}
      <section
        aria-labelledby="hero-heading"
        className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
      >
        <div className="rounded-2xl border border-brand-line bg-brand-soft p-6 sm:p-10 lg:p-12">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#b9d8d4] bg-brand-accent px-3 py-1 text-xs font-bold tracking-wider text-[#126761] uppercase">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
              Foundation ready · React Router & RTK Query
            </div>

            <h1
              id="hero-heading"
              className="text-3xl font-extrabold tracking-tight text-[#17324d] sm:text-4xl lg:text-5xl"
            >
              Work that moves your life forward.
            </h1>

            <p className="text-base leading-relaxed text-[#657789] sm:text-lg">
              The Job Marketplace frontend foundation is live. Built with React, Vite, strict
              TypeScript, React Router, Redux Toolkit, and RTK Query.
            </p>
          </div>

          {/* Search preview */}
          <div
            aria-label="Job search preview"
            className="mt-8 flex flex-col gap-2 rounded-xl border border-[#c8d5df] bg-white p-2 shadow-xs sm:flex-row sm:items-center"
          >
            <div className="flex flex-1 items-center px-3 py-2 text-sm text-[#758695]">
              <span aria-hidden="true" className="mr-2 text-base">
                ⌕
              </span>
              <span className="select-none">Job title, skill or company…</span>
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
              title="Search functional in upcoming sprint"
              className="cursor-not-allowed rounded-lg bg-[#16847f] px-5 py-2.5 text-sm font-semibold text-white opacity-85 select-none"
            >
              Search jobs
            </button>
          </div>

          {/* RTK Query Sample Query Demonstration Card */}
          <ApiStatusCard />

          {/* Foundation Status Cards */}
          <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: 'React Router v7',
                value: 'Active',
                description: 'Client routing & layout hierarchy',
              },
              {
                label: 'Redux Toolkit',
                value: 'Configured',
                description: 'Typed store & app hooks',
              },
              {
                label: 'RTK Query',
                value: 'Ready',
                description: 'Base API & cached endpoints',
              },
            ].map(({ label, value, description }) => (
              <div
                key={label}
                className="flex flex-col gap-1 rounded-xl border border-[#d4dee7] bg-white p-5 shadow-xs"
              >
                <dt className="text-xs font-bold uppercase tracking-wider text-[#657789]">
                  {label}
                </dt>
                <dd className="text-2xl font-extrabold text-[#16847f]">{value}</dd>
                <dd className="text-xs text-[#657789]">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Categories Preview */}
      <section
        aria-labelledby="categories-heading"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="categories-heading" className="text-lg font-bold text-[#17324d]">
            Explore by category
          </h2>
          <span className="text-xs text-[#657789]">Planned for future sprints</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
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
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-[#d4dee7] bg-white p-4 shadow-xs">
              <h3 className="text-sm font-bold text-[#17324d]">{title}</h3>
              <p className="mt-1 text-xs text-[#657789]">{desc}</p>
              <span className="mt-3 inline-block rounded-md bg-[#f4f7fa] px-2 py-0.5 text-[10px] font-medium text-[#657789]">
                Foundation preview
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
