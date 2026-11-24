import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Operational Health Endpoints', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  describe('GET /health', () => {
    it('returns HTTP 200 with stable status and timestamp envelope', async () => {
      const app = createApp();
      const res = await request(app).get('/health').expect(200);

      expect(res.body).toMatchObject({
        data: {
          status: 'ok',
          timestamp: expect.any(String),
        },
      });
      expect(new Date(res.body.data.timestamp).getTime()).not.toBeNaN();
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('returns HTTP 200 without invoking database readiness check', async () => {
      const dbCheckMock = vi.fn(async () => {
        throw new Error('Database is completely down');
      });

      const app = createApp({ checkDatabaseReadiness: dbCheckMock });
      const res = await request(app).get('/health/live').expect(200);

      expect(res.body).toEqual({
        data: {
          status: 'ok',
        },
      });
      // Crucial: liveness must NOT invoke the database check
      expect(dbCheckMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('returns HTTP 200 when database readiness check succeeds', async () => {
      const dbCheckMock = vi.fn(async () => {});

      const app = createApp({ checkDatabaseReadiness: dbCheckMock });
      const res = await request(app).get('/health/ready').expect(200);

      expect(res.body).toEqual({
        data: {
          status: 'ready',
        },
      });
      expect(dbCheckMock).toHaveBeenCalledTimes(1);
    });

    it('returns HTTP 503 and RFC 9457 problem details when database check fails', async () => {
      const sensitiveSecret = 'SUPER_SECRET_PG_PASSWORD_987';
      const dbCheckMock = vi.fn(async () => {
        throw new Error(
          `Connection refused to postgres://admin:${sensitiveSecret}@internal-db:5432/jmp_dev: FATAL password authentication failed`,
        );
      });

      const app = createApp({ checkDatabaseReadiness: dbCheckMock });
      const res = await request(app).get('/health/ready').expect(503);

      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: 'SERVICE_NOT_READY',
        instance: '/health/ready',
        detail: 'Service is not ready to accept traffic',
      });

      // Verification: must include requestId and X-Request-Id
      const reqId = res.body.requestId;
      expect(typeof reqId).toBe('string');
      expect(UUID_RE.test(reqId)).toBe(true);
      expect(res.headers['x-request-id']).toBe(reqId);

      // Security verification: no sensitive credentials, SQL, or driver errors in client response
      const rawBody = JSON.stringify(res.body);
      expect(rawBody).not.toContain(sensitiveSecret);
      expect(rawBody).not.toContain('internal-db');
      expect(rawBody).not.toContain('FATAL');
      expect(rawBody).not.toContain('stack');
    });

    it('returns HTTP 503 when readiness check times out', async () => {
      const timeoutError = new Error('Database readiness check timed out');
      const dbCheckMock = vi.fn(async () => {
        throw timeoutError;
      });

      const app = createApp({ checkDatabaseReadiness: dbCheckMock });
      const res = await request(app).get('/health/ready').expect(503);

      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({
        status: 503,
        code: 'SERVICE_NOT_READY',
        title: 'Service Unavailable',
      });
    });

    it('preserves liveness HTTP 200 while readiness returns HTTP 503', async () => {
      const dbCheckMock = vi.fn(async () => {
        throw new Error('Database is offline');
      });

      const app = createApp({ checkDatabaseReadiness: dbCheckMock });

      // Liveness probe succeeds
      await request(app).get('/health/live').expect(200);

      // Readiness probe fails
      await request(app).get('/health/ready').expect(503);
    });
  });
});
