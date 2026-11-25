import express from 'express';
import type { Request } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './observability/logger.js';
import { requestId } from './middleware/request-id.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { createRootRouter } from './routes/index.js';
import type { IdentityRouterOptions } from './modules/identity/index.js';

export interface AppOptions {
  corsOrigins?: string[] | undefined;
  checkDatabaseReadiness?: (() => Promise<void>) | undefined;
  identity?: IdentityRouterOptions | undefined;
}

/**
 * Factory function: constructs and returns a configured Express application.
 *
 * IMPORTANT: This function must NOT start listening, register process signal
 * handlers, or start background work. That is the responsibility of server.ts.
 * This separation ensures tests can import the app without binding a port.
 *
 * createApp() is completely pure and has zero process.env dependencies.
 */
export function createApp(options?: AppOptions): express.Application {
  const app = express();

  // ── 1. Remove X-Powered-By ───────────────────────────────────────────────
  app.disable('x-powered-by');

  // ── 2. Request correlation ID ────────────────────────────────────────────
  app.use(requestId);

  // ── 3. Structured HTTP request logging ──────────────────────────────────
  app.use(
    pinoHttp({
      logger,
      // Attach request ID from the enriched request object.
      genReqId: (req: IncomingMessage) => (req as Request).requestId,
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (err !== undefined || (res.statusCode !== undefined && res.statusCode >= 500)) {
          return 'error';
        }
        if (res.statusCode !== undefined && res.statusCode >= 400) {
          return 'warn';
        }
        return 'info';
      },
      // Never log sensitive credentials.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
    }),
  );

  // ── 4. Helmet (security headers) ─────────────────────────────────────────
  app.use(helmet());

  // ── 5. CORS ──────────────────────────────────────────────────────────────
  const allowedOrigins = options?.corsOrigins ?? ['http://localhost:5173'];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no Origin header (curl, server-to-server).
        if (origin === undefined) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  // ── 6. JSON body parser ──────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));

  // ── 7. Routes ────────────────────────────────────────────────────────────
  app.use(
    createRootRouter({
      checkDatabaseReadiness: options?.checkDatabaseReadiness,
      identity: options?.identity,
    }),
  );

  // ── 8. Not-found handler ─────────────────────────────────────────────────
  app.use(notFound);

  // ── 9. Central error handler (must be last) ──────────────────────────────
  app.use(errorHandler);

  return app;
}
