import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAppSelector } from '../../app/hooks.js';
import { selectIsAuthenticated } from '../../app/auth-slice.js';

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
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
