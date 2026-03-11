import { randomUUID } from 'crypto';

export function generateUnsubscribeToken(): string {
  return randomUUID();
}

export function buildUnsubscribeUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/unsubscribe?token=${token}`;
}
