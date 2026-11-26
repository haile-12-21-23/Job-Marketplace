export interface VerificationEmailPayload {
  to: string;
  displayName: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export interface EmailSender {
  sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
}
