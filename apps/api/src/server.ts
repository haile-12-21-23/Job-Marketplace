import http from 'node:http';
import { createApp } from './app.js';
import { logger } from './observability/logger.js';

const PORT = Number(process.env['PORT'] ?? 3000);
const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();
const server = http.createServer(app);

// ── Startup ──────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  logger.info({ port: PORT }, `Job Marketplace API listening on port ${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error({ port: PORT }, `Port ${PORT} is already in use`);
  } else {
    logger.error({ err }, 'Server startup error');
  }
  process.exit(1);
});

// ── Graceful shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;

function shutdown(signal: string, exitCode = 0): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Received shutdown signal — stopping server');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Allow the timeout to be garbage-collected if shutdown finishes first.
  if (forceExit.unref) forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
      process.exit(1);
    }
    logger.info('HTTP server closed — exiting cleanly');
    process.exit(exitCode);
  });
}

// ── Process-level signal handlers ────────────────────────────────────────────

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection — initiating shutdown');
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  // An uncaught exception leaves the process in an unknown state; initiate bounded shutdown.
  logger.error({ err }, 'Uncaught exception — initiating shutdown');
  shutdown('uncaughtException', 1);
});
