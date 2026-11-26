import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import type { UserRepository, CreateUserInput, UserRecord } from './ports/user.repository.js';
import type {
  ConsumeVerificationTokenOutcome,
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
  IssueVerificationTokenInput,
} from './ports/email-verification-token.repository.js';
import type { EmailSender, VerificationEmailPayload } from './ports/email-sender.js';
import { BcryptPasswordHasher } from './domain/password-hasher.js';
import { CryptoVerificationTokenService } from './domain/verification-token.js';
import { ResendRateLimiter } from './infrastructure/resend-rate-limiter.js';

class MockUserRepository implements UserRepository {
  public users: UserRecord[] = [];

  async findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    const found = this.users.find((u) => u.email === normalizedEmail);
    return found ?? null;
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

class FakeEmailSender implements EmailSender {
  public sent: VerificationEmailPayload[] = [];
  public shouldFail = false;

  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Provider outage');
    }
    this.sent.push(payload);
  }
}

function extractTokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

describe('Identity Auth Routes', () => {
  let mockRepo: MockUserRepository;
  let mockTokenRepo: MockVerificationTokenRepository;
  let fakeEmailSender: FakeEmailSender;
  let hasher: BcryptPasswordHasher;
  let tokenService: CryptoVerificationTokenService;
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
    fakeEmailSender = new FakeEmailSender();
    hasher = new BcryptPasswordHasher(4); // fast salt rounds for route tests
    tokenService = new CryptoVerificationTokenService();

    app = createApp({
      identity: {
        userRepository: mockRepo,
        passwordHasher: hasher,
        verificationTokenRepository: mockTokenRepo,
        verificationTokenService: tokenService,
        emailSender: fakeEmailSender,
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
});
