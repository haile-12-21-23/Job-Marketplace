import bcrypt from 'bcryptjs';

export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  compare(plaintext: string, hash: string): Promise<boolean>;
}

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly saltRounds = 10) {}

  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, this.saltRounds);
  }

  async compare(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}
