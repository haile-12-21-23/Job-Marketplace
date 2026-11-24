import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Request, Response } from 'express';
import { createApp } from './app.js';

const app = createApp();

// ── Helper ───────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Test: GET /api/v1 ────────────────────────────────────────────────────────

describe('GET /api/v1', () => {
  it('returns HTTP 200 and a data envelope', async () => {
    const res = await request(app).get('/api/v1').expect(200);

    expect(res.body).toMatchObject({
      data: {
        service: expect.any(String),
        version: 'v1',
        status: 'ok',
      },
    });
  });

  it('includes a valid X-Request-Id response header (auto-generated)', async () => {
    const res = await request(app).get('/api/v1').expect(200);

    const id = res.headers['x-request-id'] as string | undefined;
    expect(id).toBeDefined();
    expect(UUID_RE.test(id ?? '')).toBe(true);
  });

  it('echoes a safe, well-formed incoming X-Request-Id', async () => {
    const safeId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get('/api/v1')
      .set('X-Request-Id', safeId)
      .expect(200);

    expect(res.headers['x-request-id']).toBe(safeId);
  });

  it('replaces an invalid/unsafe incoming X-Request-Id with a generated UUID', async () => {
    const unsafeId = '<script>alert(1)</script>';
    const res = await request(app)
      .get('/api/v1')
      .set('X-Request-Id', unsafeId)
      .expect(200);

    const returned = res.headers['x-request-id'] as string;
    expect(returned).not.toBe(unsafeId);
    expect(UUID_RE.test(returned)).toBe(true);
  });
});

// ── Test: 404 not found ──────────────────────────────────────────────────────

describe('Unknown route', () => {
  it('returns 404 with application/problem+json content type', async () => {
    const res = await request(app).get('/api/v1/this-does-not-exist').expect(404);

    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  });

  it('returns RFC 9457 problem body with stable code and requestId', async () => {
    const res = await request(app).get('/api/v1/unknown').expect(404);

    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'ROUTE_NOT_FOUND',
    });
    expect(typeof res.body.requestId).toBe('string');
    expect(UUID_RE.test(res.body.requestId as string)).toBe(true);
  });
});

// ── Test: Malformed JSON body ─────────────────────────────────────────────────

describe('Malformed JSON body', () => {
  it('returns 400 problem response without exposing parser internals', async () => {
    const res = await request(app)
      .post('/api/v1')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);

    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      status: 400,
      code: 'MALFORMED_JSON',
    });
    // Must not expose internal error details
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError/);
    expect(JSON.stringify(res.body)).not.toMatch(/stack/);
  });
});

// ── Test: 500 error — no internal detail exposed ─────────────────────────────

describe('Server errors', () => {
  beforeAll(async () => {
    // Register a test route on v1Router (registered before the 404 handler)
    // Express 5 propagates synchronous throws in route handlers to the error handler.
    const { v1Router } = await import('./routes/v1/index.js');
    v1Router.get('/test-error', () => {
      throw new Error('Secret internal detail');
    });
  });

  it('returns 500 problem response without exposing internal exception message', async () => {
    const res = await request(app).get('/api/v1/test-error').expect(500);

    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 500 });
    // The raw exception message must NOT appear in the client response.
    expect(JSON.stringify(res.body)).not.toMatch(/Secret internal detail/);
    expect(JSON.stringify(res.body)).not.toMatch(/stack/);
  });
});

// ── Test: CORS ───────────────────────────────────────────────────────────────

describe('CORS', () => {
  it('allows the configured local web origin', async () => {
    const res = await request(app)
      .options('/api/v1')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });

  it('does not grant wildcard access to arbitrary origins', async () => {
    const res = await request(app)
      .get('/api/v1')
      .set('Origin', 'http://evil.example.com');

    // Should not reflect the arbitrary origin.
    expect(res.headers['access-control-allow-origin']).not.toBe(
      'http://evil.example.com',
    );
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

// ── Test: Modular route registration ─────────────────────────────────────────

describe('Modular route registration', () => {
  it('allows adding a new route to the v1 router without editing middleware', async () => {
    // The v1Router is re-imported and augmented here just to verify the pattern.
    // In production, new module routers are registered in src/routes/v1/index.ts.
    const { v1Router } = await import('./routes/v1/index.js');
    v1Router.get('/ping', (_req: Request, res: Response) => {
      res.json({ data: { pong: true } });
    });

    const res = await request(app).get('/api/v1/ping').expect(200);
    expect(res.body).toMatchObject({ data: { pong: true } });
  });
});
