import React from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router';
import { useAppDispatch, useAppSelector } from '../app/hooks.js';
import { clearAuthSession, selectCurrentUser } from '../app/auth-slice.js';
import { useLogoutMutation } from '../services/auth-api.js';

export default function AuthenticatedLayout(): React.JSX.Element {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const [logoutUser, { isLoading: isLoggingOut }] = useLogoutMutation();

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    try {
      await logoutUser().unwrap();
      dispatch(clearAuthSession());
      navigate('/login', { replace: true });
    } catch {
      dispatch(
        clearAuthSession({
          notice:
            'Your local session was cleared, but we could not confirm server sign-out. Please retry server sign-out or sign in again.',
          noticeKind: 'logout_error',
        }),
      );
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-brand-ink">
      {/* Top Banner clearly identifying client-side UX session scope vs backend RBAC */}
      <div
        role="region"
        aria-label="Placeholder notice"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800"
      >
        <span className="font-bold">Authenticated Area Placeholder:</span> Your access token is held
        in memory only and restored on reload via the HttpOnly refresh cookie; server-side RBAC is
        enforced in JMP-38.
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
            {currentUser && (
              <span className="hidden text-xs font-medium text-brand-muted sm:inline">
                {currentUser.displayName}
              </span>
            )}
            <Link
              to="/"
              className="rounded-lg border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy shadow-xs hover:bg-slate-50 transition"
            >
              Back to Public Site
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#12263b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </button>
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
