import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import type { UserRepository, CreateUserInput, UserRecord } from './ports/user.repository.js';
import { BcryptPasswordHasher } from './domain/password-hasher.js';

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

describe('POST /api/v1/auth/register', () => {
  let mockRepo: MockUserRepository;
  let hasher: BcryptPasswordHasher;
  let app: ReturnType<typeof createApp>;

  const validPayload = {
    displayName: 'Abebe Bikila',
    email: 'abebe@example.com',
    password: 'SecureRunner2026!',
  };

  beforeEach(() => {
    mockRepo = new MockUserRepository();
    hasher = new BcryptPasswordHasher(4); // fast salt rounds for route tests
    app = createApp({
      identity: {
        userRepository: mockRepo,
        passwordHasher: hasher,
      },
    });
  });

  it('registers a new user and returns 201 with standard data envelope', async () => {
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

    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 409 Conflict with RFC 9457 Problem Details for duplicate normalized email', async () => {
    // Seed existing user
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

    // Verify raw database / SQL errors are not leaked
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/prisma/i);
    expect(raw).not.toMatch(/P2002/);
    expect(raw).not.toMatch(/table/i);
  });

  it('returns 422 Unprocessable Entity with field pointers on invalid input', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: 'A', // too short (< 2)
        email: 'invalid-email',
        password: 'short', // too short (< 8)
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

    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);

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
    const pointers = res.body.errors.map((e: { pointer: string }) => e.pointer);
    expect(
      pointers.some(
        (p: string) => p.includes('role') || p.includes('unauthorizedField') || p === '#',
      ),
    ).toBe(true);
  });
});
