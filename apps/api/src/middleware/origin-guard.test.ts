import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { createOriginGuardMiddleware } from './origin-guard.js';

function invokeMiddleware(
  allowedOrigins: string[],
  headers: Record<string, string | string[] | undefined>,
): Promise<unknown> {
  const middleware = createOriginGuardMiddleware(allowedOrigins);
  const req = { headers } as unknown as Request;
  const res = {} as Response;

  return new Promise((resolve) => {
    const next = vi.fn((err?: unknown) => {
      resolve(err);
    });
    middleware(req, res, next);
  });
}

describe('createOriginGuardMiddleware', () => {
  const allowed = ['http://localhost:5173', 'https://app.jobmarketplace.example'];

  it('allows exact canonical origin from allowlist', async () => {
    const err1 = await invokeMiddleware(allowed, { origin: 'http://localhost:5173' });
    expect(err1).toBeUndefined();

    const err2 = await invokeMiddleware(allowed, {
      origin: 'https://app.jobmarketplace.example',
      'sec-fetch-site': 'same-origin',
    });
    expect(err2).toBeUndefined();

    const err3 = await invokeMiddleware(allowed, {
      origin: 'http://localhost:5173',
      'sec-fetch-site': 'same-site',
    });
    expect(err3).toBeUndefined();
  });

  it('rejects missing, null, malformed, or array Origin headers', async () => {
    for (const headers of [
      {},
      { origin: '' },
      { origin: 'null' },
      { origin: 'NULL' },
      { origin: 'not-a-url' },
      { origin: 'http://localhost:5173/' },
      { origin: 'http://localhost:5173/login' },
      { origin: 'ftp://localhost:5173' },
      { origin: ['http://localhost:5173', 'https://evil.example'] },
    ]) {
      const err = await invokeMiddleware(allowed, headers);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('ORIGIN_NOT_ALLOWED');
    }
  });

  it('rejects untrusted origins and substring/suffix spoofing attempts', async () => {
    for (const origin of [
      'http://evil.example.com',
      'http://localhost:5174',
      'https://localhost:5173',
      'http://localhost:5173.evil.com',
      'https://evil-app.jobmarketplace.example',
    ]) {
      const err = await invokeMiddleware(allowed, { origin });
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('ORIGIN_NOT_ALLOWED');
    }
  });

  it('rejects Sec-Fetch-Site: cross-site even if Origin matches allowlist', async () => {
    const err = await invokeMiddleware(allowed, {
      origin: 'http://localhost:5173',
      'sec-fetch-site': 'cross-site',
    });
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
    expect((err as AppError).code).toBe('CSRF_ORIGIN_REJECTED');
  });
});
