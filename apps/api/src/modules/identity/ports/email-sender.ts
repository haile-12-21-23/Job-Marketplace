export interface VerificationEmailPayload {
  to: string;
  displayName: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export interface PasswordResetEmailPayload {
  to: string;
  displayName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface EmailSender {
  sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void>;
}
