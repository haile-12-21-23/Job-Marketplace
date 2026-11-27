import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../app/hooks.js';
import {
  clearAuthSession,
  isAuthSessionExpired,
  selectIsAuthenticated,
} from '../../app/auth-slice.js';

export interface RequireAuthGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side UX route guard for the `/app` authenticated layout.
 *
 * IMPORTANT: This guard is for browser UX navigation only and is NOT a server
 * authorization boundary. Server-side authentication and RBAC enforcement belong
 * to the API (JMP-38). Because access tokens are stored in memory only and
 * refresh rotation is pending JMP-36, a full browser reload clears memory state
 * and redirects to `/login`.
 */
export default function RequireAuthGuard({ children }: RequireAuthGuardProps): React.JSX.Element {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
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
  }, [dispatch, hasStaleSession, isAuthenticated, expiresAt]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
