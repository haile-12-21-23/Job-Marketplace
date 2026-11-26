import { describe, it, expect, vi } from 'vitest';
import {
  buildVerificationEmailContent,
  createEmailSender,
  DevelopmentEmailSender,
  HttpEmailSender,
} from './email-sender.js';
import { logger } from '../../../observability/logger.js';

describe('EmailSender adapters', () => {
  it('formats verification email with verification link and expiry guidance', () => {
    const content = buildVerificationEmailContent({
      to: 'user@example.com',
      displayName: 'Almaz <Admin>',
      verificationUrl: 'https://app.example.com/verify-email?token=raw-secret-token',
      expiresInMinutes: 60,
    });

    expect(content.subject).toBe('Verify your Job Marketplace email address');
    expect(content.text).toContain('https://app.example.com/verify-email?token=raw-secret-token');
    expect(content.text).toContain('60 minutes');
    expect(content.html).toContain('Almaz &lt;Admin&gt;');
    expect(content.html).toContain('https://app.example.com/verify-email?token=raw-secret-token');
  });

  it('DevelopmentEmailSender sends no real emails and never logs raw token or URL', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const sender = new DevelopmentEmailSender();
    const rawToken = 'very-secret-raw-token-value';
    const verificationUrl = `https://app.example.com/verify-email?token=${rawToken}`;

    await sender.sendVerificationEmail({
      to: 'user@example.com',
      displayName: 'Test User',
      verificationUrl,
      expiresInMinutes: 60,
    });

    const logged = JSON.stringify([...debugSpy.mock.calls, ...infoSpy.mock.calls]);
    expect(logged).not.toContain(rawToken);
    expect(logged).not.toContain(verificationUrl);
    expect(logged).not.toContain('user@example.com');

    debugSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('HttpEmailSender posts payload via HTTPS and throws safe error on non-2xx', async () => {
    const fetchMock = vi.fn(
      async () => new Response('Forbidden', { status: 403 }),
    ) as unknown as typeof fetch;

    const sender = new HttpEmailSender({
      endpoint: 'https://mail.example.com/send',
      apiKey: 'secret-api-key-value',
      from: 'no-reply@example.com',
      fetchImpl: fetchMock,
    });

    await expect(
      sender.sendVerificationEmail({
        to: 'user@example.com',
        displayName: 'Test User',
        verificationUrl: 'https://app.example.com/verify-email?token=raw-token',
        expiresInMinutes: 60,
      }),
    ).rejects.toThrowError('Email provider rejected request with HTTP 403');
  });

  it('createEmailSender selects DevelopmentEmailSender or HttpEmailSender from config', () => {
    expect(
      createEmailSender({
        emailProvider: 'development',
        emailFrom: 'no-reply@example.com',
      }),
    ).toBeInstanceOf(DevelopmentEmailSender);

    expect(
      createEmailSender({
        emailProvider: 'http',
        emailFrom: 'no-reply@example.com',
        emailHttpEndpoint: 'https://mail.example.com/send',
        emailHttpApiKey: 'key',
      }),
    ).toBeInstanceOf(HttpEmailSender);
  });
});
