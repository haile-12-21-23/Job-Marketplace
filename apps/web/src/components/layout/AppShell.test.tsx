import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppShell from './AppShell.js';

describe('AppShell', () => {
  it('renders the brand wordmark "jobmarket"', () => {
    render(<AppShell />);
    expect(screen.getByLabelText('Job Marketplace home')).toBeDefined();
  });

  it('renders semantic header, main, and footer landmarks', () => {
    render(<AppShell />);
    expect(screen.getByRole('banner')).toBeDefined(); // <header>
    expect(screen.getByRole('main')).toBeDefined(); // <main>
    expect(screen.getByRole('contentinfo')).toBeDefined(); // <footer>
  });

  it('renders primary heading and foundation status cards', () => {
    render(<AppShell />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Work that moves your life forward.',
    );
    expect(screen.getByText('React + Vite')).toBeDefined();
    expect(screen.getByText('Tailwind CSS v4')).toBeDefined();
    expect(screen.getByText('Error Boundary')).toBeDefined();
  });

  it('marks non-functional navigation items as disabled to prevent misleading users', () => {
    render(<AppShell />);
    const disabledItems = screen.getAllByTitle('Navigation enabled in JMP-30');
    expect(disabledItems.length).toBeGreaterThan(0);
    for (const item of disabledItems) {
      expect(item.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('provides an accessible skip-to-content link', () => {
    render(<AppShell />);
    const skipLink = screen.getByText('Skip to main content');
    expect(skipLink.getAttribute('href')).toBe('#main-content');
  });
});
