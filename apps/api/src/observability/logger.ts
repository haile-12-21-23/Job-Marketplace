import pino from 'pino';

/**
 * Singleton structured logger (Pino).
 * Import from here everywhere so the logger can be reconfigured in one place.
 */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    // Never log these field paths at any log level.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.email',
      'req.body.token',
      'req.body.refreshToken',
      'verificationUrl',
      'rawToken',
      'refreshToken',
      'accessToken',
      'tokenHash',
      'passwordHash',
      'emailHttpApiKey',
      'authAccessTokenSecret',
    ],
    censor: '[REDACTED]',
  },
});
