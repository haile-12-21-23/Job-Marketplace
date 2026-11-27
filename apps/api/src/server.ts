import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { logger } from './observability/logger.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma.js';
import { loadEnv, EnvironmentValidationError } from './config/env.js';
import type { ApiConfig } from './config/env.js';
import {
  createEmailSender,
  JoseAccessTokenService,
  LoginRateLimiter,
  OutboxPayloadCipher,
  PasswordResetOutboxDispatcher,
  PasswordResetRateLimiter,
  PrismaPasswordResetOutboxRepository,
  PrismaSessionRepository,
  ResendRateLimiter,
} from './modules/identity/index.js';
import {
  PrismaEmployerAccessRepository,
  PrismaPermissionRepository,
} from './modules/authorization/index.js';

// ── Environment Validation (Startup Boundary) ────────────────────────────────
let config: ApiConfig;
try {
  config = loadEnv();
} catch (err) {
  if (err instanceof EnvironmentValidationError) {
    logger.fatal(
      {
        issues: err.issues,
      },
      'Environment validation failed — aborting server startup',
    );
  } else {
    logger.fatal({ err }, 'Unexpected error during environment validation');
  }
  process.exit(1);
}

logger.level = config.logLevel;

const PORT = config.port;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const emailSender = createEmailSender(config);
const accessTokenService = new JoseAccessTokenService({
  secret: config.authAccessTokenSecret,
  ttlSeconds: config.authAccessTokenTtlSeconds,
  issuer: config.authAccessTokenIssuer,
  audience: config.authAccessTokenAudience,
});
const sessionRepository = new PrismaSessionRepository();
const permissionRepository = new PrismaPermissionRepository();
const employerAccessRepository = new PrismaEmployerAccessRepository();
const passwordResetOutboxRepository = new PrismaPasswordResetOutboxRepository();
const passwordResetOutboxDispatcher = new PasswordResetOutboxDispatcher({
  outboxRepository: passwordResetOutboxRepository,
  emailSender,
  payloadCipher: new OutboxPayloadCipher(config.authAccessTokenSecret),
});

const app = createApp({
  corsOrigins: config.corsOrigins,
  trustProxy: config.trustProxy,
  identity: {
    appWebUrl: config.appWebUrl,
    emailVerificationTokenTtlMinutes: config.emailVerificationTokenTtlMinutes,
    emailSender,
    resendRateLimiter: new ResendRateLimiter({
      ipMax: config.emailVerificationResendIpMax,
      ipWindowSeconds: config.emailVerificationResendIpWindowSeconds,
      emailMax: config.emailVerificationResendEmailMax,
      emailWindowSeconds: config.emailVerificationResendEmailWindowSeconds,
    }),
    sessionRepository,
    accessTokenService,
    loginRateLimiter: new LoginRateLimiter({
      ipMax: config.authLoginRateLimitIpMax,
      ipWindowSeconds: config.authLoginRateLimitIpWindowSeconds,
      emailMax: config.authLoginRateLimitEmailMax,
      emailWindowSeconds: config.authLoginRateLimitEmailWindowSeconds,
    }),
    passwordResetRateLimiter: new PasswordResetRateLimiter({
      ipMax: config.passwordResetRateLimitIpMax,
      ipWindowSeconds: config.passwordResetRateLimitIpWindowSeconds,
      emailMax: config.passwordResetRateLimitEmailMax,
      emailWindowSeconds: config.passwordResetRateLimitEmailWindowSeconds,
      confirmIpMax: config.passwordResetConfirmRateLimitIpMax,
      confirmIpWindowSeconds: config.passwordResetConfirmRateLimitIpWindowSeconds,
    }),
    passwordResetTokenTtlMinutes: config.passwordResetTokenTtlMinutes,
    passwordResetOutboxRepository,
    passwordResetOutboxDispatcher,
    outboxEncryptionSecret: config.authAccessTokenSecret,
    refreshTokenTtlDays: config.authRefreshTokenTtlDays,
    refreshCookieSameSite: config.authRefreshCookieSameSite,
    isProduction: config.nodeEnv === 'production',
  },
  authorization: {
    accessTokenService,
    sessionRepository,
    permissionRepository,
    employerAccessRepository,
  },
});
const server = http.createServer(app);

// ── Startup ──────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await connectDatabase(config.databaseUrl);
    logger.info('Database connection established successfully');
    passwordResetOutboxDispatcher.start();

    server.listen(PORT, () => {
      logger.info({ port: PORT }, `Job Marketplace API listening on port ${PORT}`);
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : 'Unknown database connection error' },
      'Failed to connect to database during startup — aborting',
    );
    process.exit(1);
  }
}

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

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
    } else {
      logger.info('HTTP server closed');
    }

    try {
      await passwordResetOutboxDispatcher.stop();
      await disconnectDatabase();
      logger.info('Database connection closed — exiting cleanly');
    } catch (dbErr) {
      logger.error({ err: dbErr }, 'Error disconnecting database');
      process.exit(1);
    }

    process.exit(err ? 1 : exitCode);
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

void start();
