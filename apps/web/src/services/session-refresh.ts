import { refreshResponseEnvelopeSchema } from '@jmp/contracts';
import type { AppDispatch } from '../app/store.js';
import { beginAuthRefresh, clearAuthSession, setAuthSession } from '../app/auth-slice.js';
import { authApi } from './auth-api.js';

const REFRESH_LOCK_NAME = 'jmp_auth_refresh';

/**
 * Per-store-dispatch single-flight promise cache.
 * Prevents duplicate concurrent refresh calls within a single tab (including React StrictMode)
 * while keeping isolated test stores independent.
 */
const inFlightByDispatch = new WeakMap<AppDispatch, Promise<boolean>>();

function isExpectedAuthFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const status = (err as { status?: unknown }).status;
  return status === 401 || status === 403;
}

async function executeRefresh(dispatch: AppDispatch): Promise<boolean> {
  try {
    const rawResponse = await dispatch(authApi.endpoints.refresh.initiate()).unwrap();
    const parsed = refreshResponseEnvelopeSchema.safeParse(rawResponse);
    if (!parsed.success) {
      dispatch(
        clearAuthSession({
          notice:
            'We could not restore your session due to an unexpected response. Please sign in again.',
          noticeKind: 'refresh_error',
        }),
      );
      return false;
    }

    dispatch(
      setAuthSession({
        accessToken: parsed.data.data.accessToken,
        expiresIn: parsed.data.data.expiresIn,
        user: parsed.data.data.user,
      }),
    );
    return true;
  } catch (err: unknown) {
    if (isExpectedAuthFailure(err)) {
      dispatch(clearAuthSession());
    } else {
      dispatch(
        clearAuthSession({
          notice:
            'Unable to verify your session due to a temporary network or server issue. Please sign in again.',
          noticeKind: 'refresh_error',
        }),
      );
    }
    return false;
  }
}

async function runWithCrossTabCoordination(dispatch: AppDispatch): Promise<boolean> {
  dispatch(beginAuthRefresh());

  const locks =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;

  if (locks && typeof locks.request === 'function') {
    try {
      return await locks.request(REFRESH_LOCK_NAME, async () => executeRefresh(dispatch));
    } catch {
      // Fallback when Web Locks is blocked by environment security policy (e.g. opaque origin).
      // Limitation: without Web Locks, simultaneous multi-tab reloads may present the same
      // pre-rotation cookie concurrently and trigger server-side family revocation.
      return executeRefresh(dispatch);
    }
  }

  // Fallback when Web Locks API is unavailable (older browsers or jsdom test environment).
  // Limitation: simultaneous reloads across multiple tabs are not serialized cross-tab.
  return executeRefresh(dispatch);
}

/**
 * Coordinates a single-flight session refresh on app/protected-route bootstrap.
 * Uses the browser Web Locks API when available to serialize refreshes across tabs.
 */
export function restoreAuthSession(dispatch: AppDispatch): Promise<boolean> {
  const existing = inFlightByDispatch.get(dispatch);
  if (existing) {
    return existing;
  }

  const promise = runWithCrossTabCoordination(dispatch).finally(() => {
    inFlightByDispatch.delete(dispatch);
  });
  inFlightByDispatch.set(dispatch, promise);
  return promise;
}
