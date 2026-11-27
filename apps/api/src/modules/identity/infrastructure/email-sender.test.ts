import { describe, it, expect, vi } from 'vitest';
import {
  buildPasswordResetEmailContent,
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

  it('formats password reset email with escaped display name, reset link, single-use notice, and expiry', () => {
    const content = buildPasswordResetEmailContent({
      to: 'user@example.com',
      displayName: 'Abebe <Admin>',
      resetUrl: 'https://app.example.com/reset-password?token=raw-reset-token',
      expiresInMinutes: 30,
    });

    expect(content.subject).toBe('Reset your Job Marketplace password');
    expect(content.text).toContain('https://app.example.com/reset-password?token=raw-reset-token');
    expect(content.text).toContain('30 minutes');
    expect(content.text).toContain('can only be used once');
    expect(content.text).toContain('safely ignore this message');
    expect(content.html).toContain('Abebe &lt;Admin&gt;');
    expect(content.html).toContain('https://app.example.com/reset-password?token=raw-reset-token');
  });

  it('DevelopmentEmailSender logs no raw reset token, reset URL, or email address', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const sender = new DevelopmentEmailSender();
    const rawToken = 'very-secret-reset-token';
    const resetUrl = `https://app.example.com/reset-password?token=${rawToken}`;

    await sender.sendPasswordResetEmail({
      to: 'user@example.com',
      displayName: 'Test User',
      resetUrl,
      expiresInMinutes: 30,
    });

    const logged = JSON.stringify([...debugSpy.mock.calls, ...infoSpy.mock.calls]);
    expect(logged).not.toContain(rawToken);
    expect(logged).not.toContain(resetUrl);
    expect(logged).not.toContain('user@example.com');

    debugSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('HttpEmailSender delivers password reset email and throws safe error on non-2xx', async () => {
    const fetchMock = vi.fn(
      async () => new Response('Sensitive upstream body', { status: 502 }),
    ) as unknown as typeof fetch;

    const sender = new HttpEmailSender({
      endpoint: 'https://mail.example.com/send',
      apiKey: 'secret-api-key',
      from: 'no-reply@example.com',
      fetchImpl: fetchMock,
    });

    await expect(
      sender.sendPasswordResetEmail({
        to: 'user@example.com',
        displayName: 'Test User',
        resetUrl: 'https://app.example.com/reset-password?token=raw-reset',
        expiresInMinutes: 30,
      }),
    ).rejects.toThrowError('Email provider rejected request with HTTP 502');
  });
});
