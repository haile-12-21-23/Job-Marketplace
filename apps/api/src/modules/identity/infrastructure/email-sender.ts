import { logger } from '../../../observability/logger.js';
import type { EmailSender, VerificationEmailPayload } from '../ports/email-sender.js';

export interface RenderedEmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Formats the verification email subject, plain-text body, and HTML body.
 */
export function buildVerificationEmailContent(
  payload: VerificationEmailPayload,
): RenderedEmailContent {
  const safeName = payload.displayName.trim() || 'there';
  const ttlLabel =
    payload.expiresInMinutes === 1 ? '1 minute' : `${payload.expiresInMinutes} minutes`;

  const subject = 'Verify your Job Marketplace email address';
  const text = [
    `Hello ${safeName},`,
    '',
    'Please verify your email address for your Job Marketplace account by opening the link below:',
    payload.verificationUrl,
    '',
    `This verification link expires in ${ttlLabel} and can only be used once.`,
    'If you did not create an account, you can safely ignore this message.',
  ].join('\n');

  const escapedName = escapeHtml(safeName);
  const escapedUrl = escapeHtml(payload.verificationUrl);
  const html = [
    `<p>Hello ${escapedName},</p>`,
    '<p>Please verify your email address for your Job Marketplace account by clicking the link below:</p>',
    `<p><a href="${escapedUrl}">Verify email address</a></p>`,
    `<p>This verification link expires in ${escapeHtml(ttlLabel)} and can only be used once.</p>`,
    '<p>If you did not create an account, you can safely ignore this message.</p>',
  ].join('');

  return { subject, text, html };
}

/**
 * Safe development/test adapter that performs no outbound network calls
 * and never logs raw tokens, full verification URLs, or secrets.
 */
export class DevelopmentEmailSender implements EmailSender {
  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    logger.debug(
      {
        provider: 'development',
        event: 'verification_email_dispatched',
        expiresInMinutes: payload.expiresInMinutes,
      },
      'Development email adapter recorded verification email dispatch',
    );
  }
}

export interface HttpEmailSenderOptions {
  endpoint: string;
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Provider-agnostic HTTP email adapter for production delivery.
 * Sends email payloads via HTTPS POST with Bearer authentication.
 */
export class HttpEmailSender implements EmailSender {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpEmailSenderOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.from = options.from;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    const content = buildVerificationEmailContent(payload);
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: payload.to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Email provider rejected request with HTTP ${response.status}`);
    }
  }
}

export interface EmailSenderConfig {
  emailProvider: 'development' | 'http';
  emailFrom: string;
  emailHttpEndpoint?: string | undefined;
  emailHttpApiKey?: string | undefined;
}

export function createEmailSender(config: EmailSenderConfig): EmailSender {
  if (config.emailProvider === 'http') {
    if (!config.emailHttpEndpoint || !config.emailHttpApiKey) {
      throw new Error('HTTP email provider requires endpoint and API key');
    }
    return new HttpEmailSender({
      endpoint: config.emailHttpEndpoint,
      apiKey: config.emailHttpApiKey,
      from: config.emailFrom,
    });
  }

  return new DevelopmentEmailSender();
}
