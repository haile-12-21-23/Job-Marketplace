import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../app/hooks.js';
import {
  clearAuthSession,
  isAuthSessionExpired,
  selectAuthStatus,
  selectIsAuthenticated,
} from '../../app/auth-slice.js';
import { restoreAuthSession } from '../../services/session-refresh.js';

export interface RequireAuthGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side UX route guard for the `/app` authenticated layout.
 *
 * IMPORTANT: This guard is for browser UX navigation only and is NOT a server
 * authorization boundary. Server-side authentication and RBAC enforcement belong
 * to the API (JMP-38). On a full reload (`status === 'idle'`), it attempts one
 * coordinated HttpOnly-cookie refresh before redirecting to `/login`.
 */
export default function RequireAuthGuard({ children }: RequireAuthGuardProps): React.JSX.Element {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authStatus = useAppSelector(selectAuthStatus);
  const hasStaleSession = useAppSelector(
    (state) => state.auth.accessToken !== null && isAuthSessionExpired(state.auth),
  );
  const expiresAt = useAppSelector((state) => state.auth.expiresAt);
  const location = useLocation();

  useEffect(() => {
    if (hasStaleSession) {
      dispatch(clearAuthSession());
      return;
    }

    if (!isAuthenticated && authStatus === 'idle') {
      void restoreAuthSession(dispatch);
      return;
    }

    if (!isAuthenticated || expiresAt === null) {
      return;
    }

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      dispatch(clearAuthSession());
      return;
    }

    const timerId = window.setTimeout(() => {
      dispatch(clearAuthSession());
    }, remainingMs);

    return () => window.clearTimeout(timerId);
  }, [dispatch, hasStaleSession, isAuthenticated, authStatus, expiresAt]);

  if (!isAuthenticated && (authStatus === 'idle' || authStatus === 'refreshing')) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[50vh] items-center justify-center px-4 py-12 text-sm font-medium text-brand-muted"
      >
        Checking your session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
