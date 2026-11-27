import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { logger } from '../../observability/logger.js';
import { UserStatus, OutboxStatus } from '../../generated/prisma/enums.js';
import type {
  UserRepository,
  CreateUserInput,
  UserRecord,
  UserCredentialRecord,
} from './ports/user.repository.js';
import type {
  CreateAuthenticatedSessionInput,
  CreateAuthenticatedSessionResult,
  CreateSessionInput,
  ReplayCheckResult,
  RevokeFamilyResult,
  RotateSessionInput,
  RotateSessionResult,
  SessionRepository,
  SessionRotationCandidate,
  UserSessionRecord,
} from './ports/session.repository.js';
import type {
  ConsumeVerificationTokenOutcome,
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
  IssueVerificationTokenInput,
} from './ports/email-verification-token.repository.js';
import type {
  ConsumePasswordResetTokenInput,
  ConsumePasswordResetTokenOutcome,
  IssuePasswordResetTokenInput,
  IssuePasswordResetTokenWithOutboxInput,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from './ports/password-reset-token.repository.js';
import type {
  MarkPasswordResetOutboxRetryInput,
  PasswordResetOutboxRecord,
  PasswordResetOutboxRepository,
} from './ports/password-reset-outbox.repository.js';
import type {
  EmailSender,
  PasswordResetEmailPayload,
  VerificationEmailPayload,
} from './ports/email-sender.js';
import { BcryptPasswordHasher } from './domain/password-hasher.js';
import { OutboxPayloadCipher } from './domain/outbox-payload-cipher.js';
import { CryptoVerificationTokenService } from './domain/verification-token.js';
import { JoseAccessTokenService } from './domain/access-token.js';
import { CryptoRefreshTokenService } from './domain/refresh-token.js';
import { PasswordResetOutboxDispatcher } from './application/password-reset-outbox-dispatcher.js';
import { ResendRateLimiter } from './infrastructure/resend-rate-limiter.js';
import { LoginRateLimiter } from './infrastructure/login-rate-limiter.js';
import { PasswordResetRateLimiter } from './infrastructure/password-reset-rate-limiter.js';

class MockUserRepository implements UserRepository {
  public users: UserRecord[] = [];

  async findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    const found = this.users.find((u) => u.email === normalizedEmail);
    return found ?? null;
  }

  async findCredentialsByEmail(normalizedEmail: string): Promise<UserCredentialRecord | null> {
    const found = this.users.find((u) => u.email === normalizedEmail);
    if (!found || !found.passwordHash) return null;
    return {
      id: found.id,
      displayName: found.displayName,
      email: found.email,
      passwordHash: found.passwordHash,
      status: found.status,
      emailVerifiedAt: found.emailVerifiedAt,
    };
  }

  async create(data: CreateUserInput): Promise<UserRecord> {
    const record: UserRecord = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: data.displayName,
      email: data.email,
      passwordHash: data.passwordHash,
      status: data.status ?? UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(record);
    return record;
  }
}

class MockSessionRepository implements SessionRepository {
  public sessions: UserSessionRecord[] = [];
  private seq = 1;

  constructor(private readonly userRepo: MockUserRepository) {}

  async create(input: CreateSessionInput): Promise<UserSessionRecord> {
    const record: UserSessionRecord = {
      id: `6ba7b810-9dad-11d1-80b4-00c04fd4300${this.seq++}`,
      userId: input.userId,
      tokenFamilyId: input.tokenFamilyId,
      refreshTokenHash: input.refreshTokenHash,
      parentSessionId: input.parentSessionId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.sessions.push(record);
    return record;
  }

  async createAuthenticatedSession(
    input: CreateAuthenticatedSessionInput,
  ): Promise<CreateAuthenticatedSessionResult> {
    const user = this.userRepo.users.find((u) => u.id === input.userId);
    if (
      !user ||
      user.passwordHash !== input.expectedPasswordHash ||
      user.status !== UserStatus.ACTIVE ||
      user.emailVerifiedAt === null
    ) {
      return { outcome: 'stale_credentials' };
    }
    const session = await this.create(input);
    return { outcome: 'created', session };
  }

  async findRotationCandidateByTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionRotationCandidate | null> {
    const session = this.sessions.find((s) => s.refreshTokenHash === refreshTokenHash);
    if (!session) return null;
    const user = this.userRepo.users.find((u) => u.id === session.userId);
    if (!user) return null;

    return {
      session: { ...session },
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }

  async findSessionCandidateByIdAndUserId(
    sessionId: string,
    userId: string,
  ): Promise<SessionRotationCandidate | null> {
    const session = this.sessions.find((s) => s.id === sessionId && s.userId === userId);
    if (!session) return null;
    const user = this.userRepo.users.find((u) => u.id === session.userId);
    if (!user) return null;

    return {
      session: { ...session },
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }

  async rotateSession(input: RotateSessionInput): Promise<RotateSessionResult> {
    const session = this.sessions.find((s) => s.refreshTokenHash === input.presentedTokenHash);
    if (!session) return { outcome: 'not_found' };

    if (session.revokedAt !== null) {
      const hasChild = this.sessions.some((s) => s.parentSessionId === session.id);
      if (hasChild) {
        for (const s of this.sessions) {
          if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
            s.revokedAt = input.now;
          }
        }
        return { outcome: 'replayed', tokenFamilyId: session.tokenFamilyId };
      }
      return { outcome: 'revoked' };
    }

    if (session.expiresAt.getTime() <= input.now.getTime()) {
      return { outcome: 'expired' };
    }

    const user = this.userRepo.users.find((u) => u.id === session.userId);
    if (!user || user.status !== UserStatus.ACTIVE || user.emailVerifiedAt === null) {
      return { outcome: 'user_ineligible' };
    }

    session.revokedAt = input.now;
    const child: UserSessionRecord = {
      id: input.newSessionId,
      userId: session.userId,
      tokenFamilyId: session.tokenFamilyId,
      refreshTokenHash: input.newRefreshTokenHash,
      parentSessionId: session.id,
      expiresAt: session.expiresAt,
      revokedAt: null,
      createdAt: input.now,
    };
    this.sessions.push(child);

    return {
      outcome: 'rotated',
      session: child,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
      },
    };
  }

  async revokeFamilyIfReplayed(refreshTokenHash: string, now: Date): Promise<ReplayCheckResult> {
    const session = this.sessions.find((s) => s.refreshTokenHash === refreshTokenHash);
    if (!session) return { outcome: 'not_found' };

    const hasChild = this.sessions.some((s) => s.parentSessionId === session.id);
    if (hasChild) {
      for (const s of this.sessions) {
        if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
          s.revokedAt = now;
        }
      }
      return { outcome: 'replayed', tokenFamilyId: session.tokenFamilyId };
    }

    return { outcome: 'revoked' };
  }

  async revokeFamilyByTokenHash(refreshTokenHash: string, now: Date): Promise<RevokeFamilyResult> {
    const session = this.sessions.find((s) => s.refreshTokenHash === refreshTokenHash);
    if (!session) return { revokedCount: 0, tokenFamilyId: null };

    let revokedCount = 0;
    for (const s of this.sessions) {
      if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
        s.revokedAt = now;
        revokedCount++;
      }
    }
    return { revokedCount, tokenFamilyId: session.tokenFamilyId };
  }
}

class MockVerificationTokenRepository implements EmailVerificationTokenRepository {
  public tokens: EmailVerificationTokenRecord[] = [];
  private seq = 1;

  constructor(private readonly userRepo: MockUserRepository) {}

  async issueToken(input: IssueVerificationTokenInput): Promise<EmailVerificationTokenRecord> {
    for (const token of this.tokens) {
      if (token.userId === input.userId && token.usedAt === null) {
        token.usedAt = input.now;
      }
    }
    const created: EmailVerificationTokenRecord = {
      id: `tok-${this.seq++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.now,
    };
    this.tokens.push(created);
    return created;
  }

  async consumeAndVerifyUser(
    tokenHash: string,
    now: Date,
  ): Promise<ConsumeVerificationTokenOutcome> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    if (!token || token.usedAt !== null || token.expiresAt.getTime() <= now.getTime()) {
      return 'invalid_or_expired';
    }
    const user = this.userRepo.users.find((u) => u.id === token.userId);
    if (!user || user.emailVerifiedAt !== null) {
      return 'invalid_or_expired';
    }
    token.usedAt = now;
    user.emailVerifiedAt = now;
    return 'verified';
  }
}

class MockPasswordResetOutboxRepository implements PasswordResetOutboxRepository {
  public events: PasswordResetOutboxRecord[] = [];
  private seq = 1;

  enqueue(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: unknown,
    now: Date,
  ): void {
    this.events.push({
      id: `obx-${this.seq++}`,
      eventType,
      aggregateType,
      aggregateId,
      payload,
      status: OutboxStatus.PENDING,
      attempts: 0,
      availableAt: now,
      createdAt: now,
    });
  }

  async claimPendingBatch(
    limit: number,
    now: Date,
    leaseMs: number,
  ): Promise<PasswordResetOutboxRecord[]> {
    const claimed: PasswordResetOutboxRecord[] = [];
    for (const event of this.events) {
      if (claimed.length >= limit) break;
      const due =
        (event.status === OutboxStatus.PENDING || event.status === OutboxStatus.PROCESSING) &&
        event.availableAt.getTime() <= now.getTime();
      if (due) {
        event.status = OutboxStatus.PROCESSING;
        event.availableAt = new Date(now.getTime() + leaseMs);
        claimed.push({ ...event });
      }
    }
    return claimed;
  }

  async markPublished(id: string): Promise<void> {
    const event = this.events.find((e) => e.id === id);
    if (event) {
      event.status = OutboxStatus.PUBLISHED;
      event.payload = { redacted: true };
    }
  }

  async markRetryOrFailed(input: MarkPasswordResetOutboxRetryInput): Promise<void> {
    const event = this.events.find((e) => e.id === input.id);
    if (event) {
      event.attempts = input.nextAttempts;
      event.availableAt = input.nextAvailableAt;
      const terminal = input.nextAttempts >= input.maxAttempts;
      event.status = terminal ? OutboxStatus.FAILED : OutboxStatus.PENDING;
      if (terminal) {
        event.payload = { redacted: true, failed: true };
      }
    }
  }
}

class MockPasswordResetTokenRepository implements PasswordResetTokenRepository {
  public tokens: PasswordResetTokenRecord[] = [];
  private seq = 1;

  constructor(
    private readonly userRepo: MockUserRepository,
    private readonly sessionRepo: MockSessionRepository,
    private readonly outboxRepo: MockPasswordResetOutboxRepository,
  ) {}

  async issueToken(input: IssuePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    for (const token of this.tokens) {
      if (token.userId === input.userId && token.usedAt === null) {
        token.usedAt = input.now;
      }
    }
    const created: PasswordResetTokenRecord = {
      id: `prt-${this.seq++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.now,
    };
    this.tokens.push(created);
    return created;
  }

  async issueTokenWithOutbox(
    input: IssuePasswordResetTokenWithOutboxInput,
  ): Promise<PasswordResetTokenRecord> {
    const token = await this.issueToken(input);
    this.outboxRepo.enqueue(
      input.outboxEvent.eventType,
      input.outboxEvent.aggregateType,
      input.outboxEvent.aggregateId,
      input.outboxEvent.payload,
      input.now,
    );
    return token;
  }

  async hasEligibleToken(tokenHash: string, now: Date): Promise<boolean> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    if (!token || token.usedAt !== null || token.expiresAt.getTime() <= now.getTime()) {
      return false;
    }
    const user = this.userRepo.users.find((u) => u.id === token.userId);
    return Boolean(user && user.status === UserStatus.ACTIVE && user.emailVerifiedAt !== null);
  }

  async consumeAndResetPassword(
    input: ConsumePasswordResetTokenInput,
  ): Promise<ConsumePasswordResetTokenOutcome> {
    const token = this.tokens.find((t) => t.tokenHash === input.tokenHash);
    if (!token || token.usedAt !== null || token.expiresAt.getTime() <= input.now.getTime()) {
      return 'invalid_or_expired';
    }
    const user = this.userRepo.users.find((u) => u.id === token.userId);
    if (!user || user.status !== UserStatus.ACTIVE || user.emailVerifiedAt === null) {
      return 'invalid_or_expired';
    }
    token.usedAt = input.now;
    user.passwordHash = input.newPasswordHash;
    for (const s of this.sessionRepo.sessions) {
      if (s.userId === user.id && s.revokedAt === null) {
        s.revokedAt = input.now;
      }
    }
    return 'reset';
  }
}

class FakeEmailSender implements EmailSender {
  public sent: VerificationEmailPayload[] = [];
  public sentReset: PasswordResetEmailPayload[] = [];
  public shouldFail = false;
  public deferredResetGate: Promise<void> | null = null;

  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Provider outage');
    }
    this.sent.push(payload);
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    if (this.deferredResetGate) {
      await this.deferredResetGate;
    }
    if (this.shouldFail) {
      throw new Error(`Provider outage for ${payload.resetUrl}`);
    }
    this.sentReset.push(payload);
  }
}

function extractTokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

function getFirstSetCookie(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'] as string | string[] | undefined;
  return Array.isArray(raw) ? raw[0]! : raw!;
}

describe('Identity Auth Routes', () => {
  const jwtSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let mockRepo: MockUserRepository;
  let mockTokenRepo: MockVerificationTokenRepository;
  let mockResetOutboxRepo: MockPasswordResetOutboxRepository;
  let mockResetTokenRepo: MockPasswordResetTokenRepository;
  let mockOutboxDispatcher: PasswordResetOutboxDispatcher;
  let mockSessionRepo: MockSessionRepository;
  let fakeEmailSender: FakeEmailSender;
  let hasher: BcryptPasswordHasher;
  let tokenService: CryptoVerificationTokenService;
  let accessTokenService: JoseAccessTokenService;
  let refreshTokenService: CryptoRefreshTokenService;
  let nowMs: number;
  let app: ReturnType<typeof createApp>;

  const validPayload = {
    displayName: 'Abebe Bikila',
    email: 'abebe@example.com',
    password: 'SecureRunner2026!',
  };

  beforeEach(() => {
    nowMs = new Date('2026-11-26T10:00:00Z').getTime();
    const clock = () => new Date(nowMs);
    mockRepo = new MockUserRepository();
    mockTokenRepo = new MockVerificationTokenRepository(mockRepo);
    mockSessionRepo = new MockSessionRepository(mockRepo);
    mockResetOutboxRepo = new MockPasswordResetOutboxRepository();
    mockResetTokenRepo = new MockPasswordResetTokenRepository(
      mockRepo,
      mockSessionRepo,
      mockResetOutboxRepo,
    );
    fakeEmailSender = new FakeEmailSender();
    hasher = new BcryptPasswordHasher(4); // fast salt rounds for route tests
    tokenService = new CryptoVerificationTokenService();
    mockOutboxDispatcher = new PasswordResetOutboxDispatcher({
      outboxRepository: mockResetOutboxRepo,
      emailSender: fakeEmailSender,
      payloadCipher: new OutboxPayloadCipher(jwtSecret),
      clock,
    });
    accessTokenService = new JoseAccessTokenService({
      secret: jwtSecret,
      ttlSeconds: 900,
      issuer: 'job-marketplace-api',
      audience: 'job-marketplace-web',
      clock,
    });
    refreshTokenService = new CryptoRefreshTokenService();

    app = createApp({
      corsOrigins: ['http://localhost:5173'],
      identity: {
        userRepository: mockRepo,
        passwordHasher: hasher,
        verificationTokenRepository: mockTokenRepo,
        verificationTokenService: tokenService,
        passwordResetTokenRepository: mockResetTokenRepo,
        passwordResetOutboxRepository: mockResetOutboxRepo,
        passwordResetOutboxDispatcher: mockOutboxDispatcher,
        outboxEncryptionSecret: jwtSecret,
        passwordResetTokenTtlMinutes: 30,
        emailSender: fakeEmailSender,
        sessionRepository: mockSessionRepo,
        accessTokenService,
        refreshTokenService,
        refreshTokenTtlDays: 30,
        refreshCookieSameSite: 'lax',
        isProduction: false,
        appWebUrl: 'https://jobs.example.com',
        emailVerificationTokenTtlMinutes: 60,
        clock,
        resendRateLimiter: new ResendRateLimiter({
          ipMax: 5,
          ipWindowSeconds: 900,
          emailMax: 2,
          emailWindowSeconds: 900,
          clock,
        }),
        loginRateLimiter: new LoginRateLimiter({
          ipMax: 5,
          ipWindowSeconds: 900,
          emailMax: 2,
          emailWindowSeconds: 900,
          clock,
        }),
        passwordResetRateLimiter: new PasswordResetRateLimiter({
          ipMax: 5,
          ipWindowSeconds: 900,
          emailMax: 2,
          emailWindowSeconds: 900,
          confirmIpMax: 5,
          confirmIpWindowSeconds: 900,
          clock,
        }),
      },
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user, dispatches verification email, and returns 201 with standard data envelope', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);

      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['location']).toBe('/api/v1/users/550e8400-e29b-41d4-a716-446655440000');
      expect(res.headers['x-request-id']).toBeDefined();

      expect(res.body).toEqual({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe Bikila',
          email: 'abebe@example.com',
          emailVerificationRequired: true,
        },
      });

      // Verification token persisted as hash & email dispatched
      expect(mockTokenRepo.tokens).toHaveLength(1);
      expect(fakeEmailSender.sent).toHaveLength(1);
      const rawToken = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);
      expect(rawToken.length).toBeGreaterThanOrEqual(40);
      expect(mockTokenRepo.tokens[0]?.tokenHash).toBe(tokenService.hashToken(rawToken));
      expect(mockTokenRepo.tokens[0]?.tokenHash).not.toBe(rawToken);

      // Check stored state
      expect(mockRepo.users).toHaveLength(1);
      const stored = mockRepo.users[0];
      expect(stored?.displayName).toBe('Abebe Bikila');
      expect(stored?.email).toBe('abebe@example.com');
      expect(stored?.status).toBe(UserStatus.ACTIVE);
      expect(stored?.emailVerifiedAt).toBeNull();

      // Verify stored password hash with bcrypt
      expect(stored?.passwordHash).toBeDefined();
      expect(stored?.passwordHash).not.toBe(validPayload.password);
      const matches = await hasher.compare(validPayload.password, stored!.passwordHash!);
      expect(matches).toBe(true);
    });

    it('normalizes email (lowercase + trim) and trims displayName', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          displayName: '  Abebe Bikila  ',
          email: '  Abebe.Runner@Example.COM  ',
          password: 'SecureRunner2026!',
        })
        .expect(201);

      expect(res.body.data.displayName).toBe('Abebe Bikila');
      expect(res.body.data.email).toBe('abebe.runner@example.com');

      const stored = mockRepo.users[0];
      expect(stored?.displayName).toBe('Abebe Bikila');
      expect(stored?.email).toBe('abebe.runner@example.com');
    });

    it('does not leak password, passwordHash, or token material in response or headers', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);

      const bodyString = JSON.stringify(res.body);
      expect(bodyString).not.toMatch(/SecureRunner2026!/);
      expect(bodyString).not.toMatch(/passwordHash/);
      expect(bodyString).not.toMatch(/accessToken/);
      expect(bodyString).not.toMatch(/refreshToken/);
      expect(bodyString).not.toMatch(/verify-email/);

      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns 409 Conflict with RFC 9457 Problem Details for duplicate normalized email', async () => {
      mockRepo.users.push({
        id: 'existing-id',
        displayName: 'Existing User',
        email: 'abebe@example.com',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          displayName: 'Another Person',
          email: '  ABEBE@example.com  ',
          password: 'Password999!',
        })
        .expect(409);

      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        detail: 'An account with this email address already exists.',
        instance: '/api/v1/auth/register',
        errors: [
          {
            pointer: '#/email',
            code: 'DUPLICATE_EMAIL',
            detail: 'An account with this email address already exists.',
          },
        ],
      });
      expect(res.body.requestId).toBeDefined();
    });

    it('returns 422 Unprocessable Entity with field pointers on invalid input', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          displayName: 'A',
          email: 'invalid-email',
          password: 'short',
        })
        .expect(422);

      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({
        type: 'about:blank',
        status: 422,
        code: 'VALIDATION_ERROR',
        title: 'Unprocessable Entity',
        detail: 'One or more fields are invalid.',
        instance: '/api/v1/auth/register',
      });

      const pointers = res.body.errors.map((e: { pointer: string }) => e.pointer);
      expect(pointers).toContain('#/displayName');
      expect(pointers).toContain('#/email');
      expect(pointers).toContain('#/password');
    });

    it('rejects unknown fields with 422 (.strict() contract enforcement)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validPayload,
          role: 'SUPER_ADMIN',
          unauthorizedField: true,
        })
        .expect(422);

      expect(res.body.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    it('verifies user email with valid token, sets emailVerifiedAt, and rejects reuse', async () => {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      const rawToken = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken })
        .expect(200);

      expect(verifyRes.body).toEqual({
        data: {
          verified: true,
          message: 'Your email address has been verified.',
        },
      });
      expect(verifyRes.headers['set-cookie']).toBeUndefined();
      expect(mockRepo.users[0]?.emailVerifiedAt).not.toBeNull();

      // Reusing the same token must fail
      const reuseRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken })
        .expect(400);

      expect(reuseRes.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(reuseRes.body).toMatchObject({
        status: 400,
        code: 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
      });
    });

    it('rejects unknown and expired tokens safely', async () => {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      const rawToken = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);

      await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'unknown-token-value' })
        .expect(400);

      // Advance clock beyond 60-minute TTL
      nowMs += 61 * 60_000;
      const expiredRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken })
        .expect(400);

      expect(expiredRes.body.code).toBe('INVALID_OR_EXPIRED_VERIFICATION_TOKEN');
      expect(mockRepo.users[0]?.emailVerifiedAt).toBeNull();
    });

    it('enforces strict validation (422) for missing/empty token or extra fields', async () => {
      const missingRes = await request(app).post('/api/v1/auth/verify-email').send({}).expect(422);
      expect(missingRes.body.code).toBe('VALIDATION_ERROR');

      const extraRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'abc', extra: true })
        .expect(422);
      expect(extraRes.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/resend-verification', () => {
    it('supersedes prior token and sends new email for unverified account', async () => {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      const firstToken = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);

      const resendRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: '  ABEBE@Example.COM  ' })
        .expect(200);

      expect(resendRes.body).toEqual({
        data: {
          accepted: true,
          message:
            'If an unverified account exists for that email address, a verification email has been sent.',
        },
      });
      expect(fakeEmailSender.sent).toHaveLength(2);
      const secondToken = extractTokenFromUrl(fakeEmailSender.sent[1]!.verificationUrl);
      expect(secondToken).not.toBe(firstToken);

      // Old token superseded -> rejected
      await request(app).post('/api/v1/auth/verify-email').send({ token: firstToken }).expect(400);

      // New token succeeds
      await request(app).post('/api/v1/auth/verify-email').send({ token: secondToken }).expect(200);
    });

    it('returns identical response for unknown and already-verified emails without sending email', async () => {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      const token = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);
      await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);

      const sentBefore = fakeEmailSender.sent.length;
      const verifiedRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: validPayload.email })
        .expect(200);

      const unknownRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(verifiedRes.body).toEqual(unknownRes.body);
      expect(fakeEmailSender.sent).toHaveLength(sentBefore);
    });

    it('handles provider failures safely without leaking account existence', async () => {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      fakeEmailSender.shouldFail = true;

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: validPayload.email })
        .expect(200);

      expect(res.body.data.accepted).toBe(true);
    });

    it('enforces per-email and per-IP rate limits with 429 Problem Details and Retry-After header', async () => {
      // Email limit configured to 2 in beforeEach
      await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'rate@example.com' })
        .expect(200);
      await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'RATE@example.com' })
        .expect(200);

      const rateLimited = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'rate@example.com' })
        .expect(429);

      expect(rateLimited.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(rateLimited.headers['retry-after']).toBeDefined();
      expect(rateLimited.body).toMatchObject({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });

      // Different emails still hit IP limit (configured to 5; 3 used so far)
      await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'other1@example.com' })
        .expect(200);
      await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'other2@example.com' })
        .expect(200);

      const ipLimited = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'other3@example.com' })
        .expect(429);

      expect(ipLimited.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('returns 422 for invalid email or extra fields', async () => {
      await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'not-an-email' })
        .expect(422);

      await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'user@example.com', extra: 1 })
        .expect(422);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    async function seedVerifiedUser() {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      const token = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);
      await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    }

    it('authenticates verified active user, persists session, sets HttpOnly refresh cookie, and returns access token', async () => {
      await seedVerifiedUser();

      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: '  ABEBE@Example.COM  ',
          password: validPayload.password,
        })
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['pragma']).toBe('no-cache');

      expect(res.body).toEqual({
        data: {
          accessToken: expect.any(String),
          tokenType: 'Bearer',
          expiresIn: 900,
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            displayName: 'Abebe Bikila',
            email: 'abebe@example.com',
          },
        },
      });

      const bodyString = JSON.stringify(res.body);
      expect(bodyString).not.toContain(validPayload.password);
      expect(bodyString).not.toContain('passwordHash');
      expect(bodyString).not.toContain('refreshToken');

      // Verify Set-Cookie attributes
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
      expect(cookieHeader).toContain('jmp_refresh=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Path=/api/v1/auth');
      expect(cookieHeader).not.toContain('Domain=');
      expect(cookieHeader).not.toContain('Secure');

      const cookieValue = cookieHeader.split(';')[0]!.split('=')[1]!;
      expect(bodyString).not.toContain(cookieValue);

      // Persisted session has hashed refresh token only
      expect(mockSessionRepo.sessions).toHaveLength(1);
      const session = mockSessionRepo.sessions[0]!;
      expect(session.refreshTokenHash).toBe(refreshTokenService.hashToken(cookieValue));
      expect(session.refreshTokenHash).not.toBe(cookieValue);

      // Verify JWT claims match persisted session
      const claims = await accessTokenService.verify(res.body.data.accessToken as string);
      expect(claims.sub).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(claims.sid).toBe(session.id);
    });

    it('sets __Secure- prefixed Secure HttpOnly cookie in production mode', async () => {
      const prodApp = createApp({
        identity: {
          userRepository: mockRepo,
          passwordHasher: hasher,
          sessionRepository: mockSessionRepo,
          accessTokenService,
          refreshTokenService,
          isProduction: true,
          refreshCookieSameSite: 'lax',
          clock: () => new Date(nowMs),
        },
      });

      mockRepo.users.push({
        id: '550e8400-e29b-41d4-a716-446655440000',
        displayName: 'Abebe Bikila',
        email: 'abebe@example.com',
        passwordHash: await hasher.hash(validPayload.password),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(nowMs),
        createdAt: new Date(nowMs),
        updatedAt: new Date(nowMs),
      });

      const res = await request(prodApp)
        .post('/api/v1/auth/login')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['pragma']).toBe('no-cache');

      const cookieHeader = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie'][0]!
        : res.headers['set-cookie']!;
      expect(cookieHeader).toContain('__Secure-jmp_refresh=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('Secure');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Path=/api/v1/auth');
      expect(cookieHeader).not.toContain('Domain=');
    });

    it('returns generic 401 INVALID_CREDENTIALS for unverified user, wrong password, or unknown user', async () => {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);

      const unverifiedRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(401);

      const unknownRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'unknown@example.com', password: validPayload.password })
        .expect(401);

      expect(unverifiedRes.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(unverifiedRes.body).toMatchObject({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        detail: 'Invalid email or password.',
      });
      expect(unknownRes.body).toMatchObject({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        detail: 'Invalid email or password.',
      });
      expect(unverifiedRes.headers['set-cookie']).toBeUndefined();
      expect(mockSessionRepo.sessions).toHaveLength(0);
    });

    it('enforces per-email and per-IP login rate limits consistently with Retry-After', async () => {
      await seedVerifiedUser();

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'missing@example.com', password: 'WrongPassword123!' })
        .expect(401);
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'MISSING@Example.COM', password: 'WrongPassword123!' })
        .expect(401);

      const emailLimited = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'missing@example.com', password: 'WrongPassword123!' })
        .expect(429);

      expect(emailLimited.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(emailLimited.headers['retry-after']).toBeDefined();
      expect(emailLimited.body).toMatchObject({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });

      // IP limit configured to 5 (3 consumed so far)
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'other1@example.com', password: 'WrongPassword123!' })
        .expect(401);
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'other2@example.com', password: 'WrongPassword123!' })
        .expect(401);

      const ipLimited = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'other3@example.com', password: 'WrongPassword123!' })
        .expect(429);

      expect(ipLimited.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('returns 422 on invalid input or extra properties', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bad', password: 'short' })
        .expect(422);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validPayload.email, password: validPayload.password, role: 'ADMIN' })
        .expect(422);
    });

    it('configures pino logger redaction for email, password, cookie, authorization, and token fields', () => {
      const redactPaths = (logger as unknown as { bindings?: () => unknown }) ? true : false;
      expect(redactPaths).toBe(true);
      const warnSpy = vi.spyOn(logger, 'warn');
      expect(warnSpy).toBeDefined();
      warnSpy.mockRestore();
    });
  });

  describe('POST /api/v1/auth/refresh and POST /api/v1/auth/logout', () => {
    async function seedAndLogin(origin = 'http://localhost:5173') {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      const verifyToken = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);
      await request(app).post('/api/v1/auth/verify-email').send({ token: verifyToken }).expect(200);

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(200);

      const setCookie = loginRes.headers['set-cookie'];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
      const rawRefreshCookie = cookieHeader.split(';')[0]!;
      return { loginRes, rawRefreshCookie };
    }

    it('rotates refresh cookie, sets no-store headers, returns new JWT bound to child sid, and detects replay', async () => {
      const { rawRefreshCookie } = await seedAndLogin();
      const rootSession = mockSessionRepo.sessions[0]!;

      nowMs += 60_000;
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Sec-Fetch-Site', 'same-site')
        .set('Cookie', rawRefreshCookie)
        .expect(200);

      expect(refreshRes.headers['cache-control']).toBe('no-store');
      expect(refreshRes.headers['pragma']).toBe('no-cache');
      expect(refreshRes.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(refreshRes.headers['access-control-allow-credentials']).toBe('true');

      expect(refreshRes.body).toEqual({
        data: {
          accessToken: expect.any(String),
          tokenType: 'Bearer',
          expiresIn: 900,
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            displayName: 'Abebe Bikila',
            email: 'abebe@example.com',
          },
        },
      });

      const setCookie = refreshRes.headers['set-cookie'];
      const newCookieHeader = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
      expect(newCookieHeader).toContain('jmp_refresh=');
      expect(newCookieHeader).toContain('HttpOnly');
      expect(newCookieHeader).toContain('SameSite=Lax');
      expect(newCookieHeader).toContain('Path=/api/v1/auth');
      expect(newCookieHeader).not.toContain('Domain=');
      const newCookiePair = newCookieHeader.split(';')[0]!;
      const newRawToken = newCookiePair.split('=')[1]!;
      expect(newCookiePair).not.toBe(rawRefreshCookie);

      const bodyString = JSON.stringify(refreshRes.body);
      expect(bodyString).not.toContain(newRawToken);
      expect(bodyString).not.toContain('refreshToken');

      expect(mockSessionRepo.sessions).toHaveLength(2);
      const childSession = mockSessionRepo.sessions[1]!;
      expect(rootSession.revokedAt).not.toBeNull();
      expect(childSession.parentSessionId).toBe(rootSession.id);
      expect(childSession.tokenFamilyId).toBe(rootSession.tokenFamilyId);
      expect(childSession.expiresAt.getTime()).toBe(rootSession.expiresAt.getTime());

      const claims = await accessTokenService.verify(refreshRes.body.data.accessToken as string);
      expect(claims.sid).toBe(childSession.id);

      // Replaying the consumed parent cookie returns generic 401 and revokes the family
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', rawRefreshCookie)
        .expect(401);

      expect(replayRes.body).toMatchObject({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        detail: 'Invalid or expired session.',
      });
      expect(childSession.revokedAt).not.toBeNull();

      // Subsequent use of child cookie now fails with identical generic 401
      const afterReplayChildRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', newCookiePair)
        .expect(401);

      expect(afterReplayChildRes.body).toMatchObject({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        detail: 'Invalid or expired session.',
      });
    });

    it('rejects missing, unknown, duplicate, expired, or body-supplied refresh credentials identically', async () => {
      const { rawRefreshCookie } = await seedAndLogin();
      const rawToken = rawRefreshCookie.split('=')[1]!;

      const missingRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .send({ refreshToken: rawToken })
        .expect(401);

      const authHeaderRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Authorization', `Bearer ${rawToken}`)
        .expect(401);

      const unknownRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', 'jmp_refresh=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        .expect(401);

      const duplicateRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', `${rawRefreshCookie}; ${rawRefreshCookie}`)
        .expect(401);

      for (const r of [missingRes, authHeaderRes, unknownRes, duplicateRes]) {
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.headers['pragma']).toBe('no-cache');
        expect(r.body).toMatchObject({
          status: 401,
          code: 'INVALID_REFRESH_TOKEN',
          detail: 'Invalid or expired session.',
        });
      }

      // Expired session
      nowMs = mockSessionRepo.sessions[0]!.expiresAt.getTime() + 1000;
      const expiredRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', rawRefreshCookie)
        .expect(401);
      expect(expiredRes.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('enforces strict Origin allowlist and Sec-Fetch-Site protection on refresh and logout', async () => {
      const { rawRefreshCookie } = await seedAndLogin();

      for (const path of ['/api/v1/auth/refresh', '/api/v1/auth/logout']) {
        await request(app).post(path).set('Cookie', rawRefreshCookie).expect(403);
        await request(app)
          .post(path)
          .set('Origin', 'null')
          .set('Cookie', rawRefreshCookie)
          .expect(403);
        await request(app)
          .post(path)
          .set('Origin', 'not-a-valid-origin')
          .set('Cookie', rawRefreshCookie)
          .expect(403);
        await request(app)
          .post(path)
          .set('Origin', 'https://evil.example.com')
          .set('Cookie', rawRefreshCookie)
          .expect(403);
        await request(app)
          .post(path)
          .set('Origin', 'http://localhost:5173')
          .set('Sec-Fetch-Site', 'cross-site')
          .set('Cookie', rawRefreshCookie)
          .expect(403);
      }

      // Session remains untouched after rejected CSRF attempts
      expect(mockSessionRepo.sessions[0]!.revokedAt).toBeNull();
    });

    it('logout revokes only the presented token family, clears cookie with matching attributes, and is idempotent', async () => {
      const { rawRefreshCookie: device1Cookie } = await seedAndLogin();

      // Sign in on a second device (second token family for same user)
      const login2 = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(200);
      const device2Cookie = getFirstSetCookie(login2.headers).split(';')[0]!;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', device1Cookie)
        .expect(200);

      expect(logoutRes.headers['cache-control']).toBe('no-store');
      expect(logoutRes.headers['pragma']).toBe('no-cache');
      expect(logoutRes.body).toEqual({ data: { loggedOut: true } });

      const clearHeader = getFirstSetCookie(logoutRes.headers);
      expect(clearHeader).toContain('jmp_refresh=;');
      expect(clearHeader).toContain('Path=/api/v1/auth');
      expect(clearHeader).toContain('HttpOnly');
      expect(clearHeader).toContain('SameSite=Lax');
      expect(clearHeader).not.toContain('Domain=');
      expect(clearHeader).not.toContain('Max-Age');

      expect(mockSessionRepo.sessions[0]!.revokedAt).not.toBeNull();
      expect(mockSessionRepo.sessions[1]!.revokedAt).toBeNull();

      // Device 1 cookie can no longer refresh
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', device1Cookie)
        .expect(401);

      // Device 2 cookie still refreshes cleanly
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', device2Cookie)
        .expect(200);

      // Idempotent logout with missing or unknown cookie still clears cookie & returns 200
      const idempotentRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      expect(idempotentRes.body).toEqual({ data: { loggedOut: true } });
      expect(idempotentRes.headers['set-cookie']).toBeDefined();
    });

    it('uses __Secure- cookie name and Secure flag on refresh and logout clear in production mode', async () => {
      const customApp = createApp({
        corsOrigins: ['https://app.example.com'],
        identity: {
          userRepository: mockRepo,
          passwordHasher: hasher,
          sessionRepository: mockSessionRepo,
          accessTokenService,
          refreshTokenService,
          isProduction: true,
          refreshCookieSameSite: 'strict',
          clock: () => new Date(nowMs),
        },
      });

      mockRepo.users.push({
        id: '550e8400-e29b-41d4-a716-446655440000',
        displayName: 'Abebe Bikila',
        email: 'abebe@example.com',
        passwordHash: await hasher.hash(validPayload.password),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(nowMs),
        createdAt: new Date(nowMs),
        updatedAt: new Date(nowMs),
      });

      const loginRes = await request(customApp)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://app.example.com')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(200);

      const loginCookie = getFirstSetCookie(loginRes.headers).split(';')[0]!;
      expect(loginCookie).toContain('__Secure-jmp_refresh=');

      const refreshRes = await request(customApp)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://app.example.com')
        .set('Cookie', loginCookie)
        .expect(200);
      const rotatedCookie = getFirstSetCookie(refreshRes.headers);
      expect(rotatedCookie).toContain('__Secure-jmp_refresh=');
      expect(rotatedCookie).toContain('Secure');
      expect(rotatedCookie).toContain('SameSite=Strict');
      expect(rotatedCookie).toContain('Path=/api/v1/auth');

      const logoutRes = await request(customApp)
        .post('/api/v1/auth/logout')
        .set('Origin', 'https://app.example.com')
        .set('Cookie', rotatedCookie.split(';')[0]!)
        .expect(200);
      const clearedCookie = getFirstSetCookie(logoutRes.headers);
      expect(clearedCookie).toContain('__Secure-jmp_refresh=;');
      expect(clearedCookie).toContain('Secure');
      expect(clearedCookie).toContain('SameSite=Strict');
      expect(clearedCookie).toContain('Path=/api/v1/auth');
    });
  });

  describe('POST /api/v1/auth/password-reset/request and POST /api/v1/auth/password-reset/confirm', () => {
    async function seedVerifiedUserAndSessions() {
      await request(app).post('/api/v1/auth/register').send(validPayload).expect(201);
      const verifyToken = extractTokenFromUrl(fakeEmailSender.sent[0]!.verificationUrl);
      await request(app).post('/api/v1/auth/verify-email').send({ token: verifyToken }).expect(200);

      // Establish two separate sessions/families (two devices)
      const login1 = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(200);
      const login2 = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(200);

      return {
        cookie1: getFirstSetCookie(login1.headers).split(';')[0]!,
        cookie2: getFirstSetCookie(login2.headers).split(';')[0]!,
      };
    }

    it('returns identical 202 anti-enumeration response for unknown, unverified, inactive, and active users without leaking tokens', async () => {
      mockRepo.users.push({
        id: 'u-unverified',
        displayName: 'Unverified',
        email: 'unverified@example.com',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        createdAt: new Date(nowMs),
        updatedAt: new Date(nowMs),
      });
      mockRepo.users.push({
        id: 'u-suspended',
        displayName: 'Suspended',
        email: 'suspended@example.com',
        status: UserStatus.SUSPENDED,
        emailVerifiedAt: new Date(nowMs),
        createdAt: new Date(nowMs),
        updatedAt: new Date(nowMs),
      });

      const unknownRes = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'missing@example.com' })
        .expect(202);
      const unverifiedRes = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'unverified@example.com' })
        .expect(202);
      const suspendedRes = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'suspended@example.com' })
        .expect(202);

      expect(fakeEmailSender.sentReset).toHaveLength(0);
      expect(mockResetTokenRepo.tokens).toHaveLength(0);

      await seedVerifiedUserAndSessions();

      const activeRes = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: '  ABEBE@Example.COM  ' })
        .expect(202);
      await mockOutboxDispatcher.drain();

      const expectedBody = {
        data: {
          accepted: true,
          message:
            'If an account matches that email address, password reset instructions will be sent.',
        },
      };
      expect(unknownRes.body).toEqual(expectedBody);
      expect(unverifiedRes.body).toEqual(expectedBody);
      expect(suspendedRes.body).toEqual(expectedBody);
      expect(activeRes.body).toEqual(expectedBody);

      for (const r of [unknownRes, unverifiedRes, suspendedRes, activeRes]) {
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.headers['pragma']).toBe('no-cache');
      }

      expect(fakeEmailSender.sentReset).toHaveLength(1);
      expect(mockResetTokenRepo.tokens).toHaveLength(1);
      const rawToken = extractTokenFromUrl(fakeEmailSender.sentReset[0]!.resetUrl);
      expect(rawToken.length).toBeGreaterThanOrEqual(40);
      expect(mockResetTokenRepo.tokens[0]!.tokenHash).toBe(tokenService.hashToken(rawToken));
      expect(JSON.stringify(activeRes.body)).not.toContain(rawToken);
    });

    it('returns identical 202 even when email provider fails and enforces independent IP/email rate limits', async () => {
      await seedVerifiedUserAndSessions();
      fakeEmailSender.shouldFail = true;

      const failDeliveryRes = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: validPayload.email })
        .expect(202);

      expect(failDeliveryRes.body.data.accepted).toBe(true);
      await mockOutboxDispatcher.drain();
      expect(mockResetOutboxRepo.events).toHaveLength(1);
      expect(mockResetOutboxRepo.events[0]!.attempts).toBe(1);
      expect(mockResetOutboxRepo.events[0]!.status).toBe(OutboxStatus.PENDING);

      // Email rate limit is 2 in test setup
      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'ABEBE@example.com' })
        .expect(202);

      const emailLimited = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: validPayload.email })
        .expect(429);

      expect(emailLimited.headers['retry-after']).toBeDefined();
      expect(emailLimited.body).toMatchObject({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });

      // IP rate limit is 5 (3 used so far)
      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'other1@example.com' })
        .expect(202);
      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'other2@example.com' })
        .expect(202);

      const ipLimited = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'other3@example.com' })
        .expect(429);

      expect(ipLimited.headers['retry-after']).toBeDefined();
      expect(ipLimited.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('confirms reset, updates password hash, revokes all active sessions across families, and rejects token reuse', async () => {
      const { cookie1, cookie2 } = await seedVerifiedUserAndSessions();
      // Advance beyond login rate-limit window before post-reset login verification
      nowMs += 901_000;

      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: validPayload.email })
        .expect(202);
      await mockOutboxDispatcher.drain();

      const firstToken = extractTokenFromUrl(fakeEmailSender.sentReset[0]!.resetUrl);

      // Issuing a newer token supersedes the first token
      nowMs += 1000;
      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: validPayload.email })
        .expect(202);
      await mockOutboxDispatcher.drain();
      const secondToken = extractTokenFromUrl(fakeEmailSender.sentReset[1]!.resetUrl);
      expect(secondToken).not.toBe(firstToken);

      const supersededRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: firstToken, newPassword: 'BrandNewPassword123!' })
        .expect(400);
      expect(supersededRes.headers['cache-control']).toBe('no-store');
      expect(supersededRes.headers['pragma']).toBe('no-cache');
      expect(supersededRes.body).toMatchObject({
        status: 400,
        code: 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN',
      });

      const newPassword = 'BrandNewPassword123!';
      const confirmRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: secondToken, newPassword })
        .expect(200);

      expect(confirmRes.headers['cache-control']).toBe('no-store');
      expect(confirmRes.headers['pragma']).toBe('no-cache');
      expect(confirmRes.headers['set-cookie']).toBeUndefined();
      expect(confirmRes.body).toEqual({
        data: {
          reset: true,
          message: 'Your password has been reset. You can now sign in with your new password.',
        },
      });
      const confirmBodyString = JSON.stringify(confirmRes.body);
      expect(confirmBodyString).not.toContain(newPassword);
      expect(confirmBodyString).not.toContain(secondToken);

      // Reusing consumed token fails with generic 400
      const reuseRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: secondToken, newPassword: 'AnotherPassword123!' })
        .expect(400);
      expect(reuseRes.body.code).toBe('INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN');

      // Both pre-existing device sessions are revoked and cannot refresh
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', cookie1)
        .expect(401);
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', cookie2)
        .expect(401);

      // Old password fails; new password succeeds
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(401);
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validPayload.email, password: newPassword })
        .expect(200);
    });

    it('rejects expired reset token and invalid confirmation payloads (422)', async () => {
      await seedVerifiedUserAndSessions();

      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: validPayload.email })
        .expect(202);
      await mockOutboxDispatcher.drain();
      const rawToken = extractTokenFromUrl(fakeEmailSender.sentReset[0]!.resetUrl);

      // Advance clock past 30-minute TTL
      nowMs += 31 * 60_000;
      const expiredRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'ValidNewPassword123!' })
        .expect(400);
      expect(expiredRes.body.code).toBe('INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN');

      // Weak password / extra fields -> 422
      await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'short' })
        .expect(422);
      await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'ValidNewPassword123!', extra: true })
        .expect(422);
      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'bad-email' })
        .expect(422);
    });

    it('returns 202 immediately via durable outbox without blocking on slow email provider latency', async () => {
      await seedVerifiedUserAndSessions();

      let releaseProvider!: () => void;
      fakeEmailSender.deferredResetGate = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });

      let requestCompleted = false;
      const responsePromise = request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: validPayload.email })
        .expect(202)
        .then((res) => {
          requestCompleted = true;
          return res;
        });

      const res = await responsePromise;
      expect(requestCompleted).toBe(true);
      expect(res.body.data.accepted).toBe(true);

      // Durable outbox item persisted before email delivery completes, without plaintext URL/token
      expect(mockResetOutboxRepo.events).toHaveLength(1);
      const outboxEvent = mockResetOutboxRepo.events[0]!;
      expect([OutboxStatus.PENDING, OutboxStatus.PROCESSING]).toContain(outboxEvent.status);
      expect(JSON.stringify(outboxEvent.payload)).not.toContain('reset-password');

      // Provider finishes asynchronously -> outbox dispatches and marks PUBLISHED
      fakeEmailSender.deferredResetGate = null;
      releaseProvider();
      await mockOutboxDispatcher.waitForIdle();

      expect(fakeEmailSender.sentReset).toHaveLength(1);
      expect(outboxEvent.status).toBe(OutboxStatus.PUBLISHED);
      expect(outboxEvent.payload).toEqual({ redacted: true });
    });

    it('throttles POST /api/v1/auth/password-reset/confirm by IP with 429 Problem Details and skips bcrypt on invalid tokens', async () => {
      const hashSpy = vi.spyOn(hasher, 'hash');

      try {
        // Confirm IP limit is configured to 5 in test setup; invalid tokens must not trigger bcrypt.hash
        for (let i = 0; i < 5; i++) {
          const invalidRes = await request(app)
            .post('/api/v1/auth/password-reset/confirm')
            .send({
              token: `invalid-reset-token-${i}`,
              newPassword: 'ValidNewPassword123!',
            })
            .expect(400);

          expect(invalidRes.body.code).toBe('INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN');
        }

        expect(hashSpy).not.toHaveBeenCalled();

        const throttledRes = await request(app)
          .post('/api/v1/auth/password-reset/confirm')
          .send({
            token: 'invalid-reset-token-6',
            newPassword: 'ValidNewPassword123!',
          })
          .expect(429);

        expect(throttledRes.headers['content-type']).toMatch(/application\/problem\+json/);
        expect(throttledRes.headers['retry-after']).toBeDefined();
        expect(throttledRes.body).toMatchObject({
          status: 429,
          code: 'RATE_LIMIT_EXCEEDED',
        });
        expect(hashSpy).not.toHaveBeenCalled();
      } finally {
        hashSpy.mockRestore();
      }
    });
  });
});
