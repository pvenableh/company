// server/utils/session.ts
// Session management utilities for nuxt-auth-utils

import type { H3Event } from "h3";

interface DirectusTokens {
  access_token: string;
  refresh_token: string;
  expires: number;
}

interface UserSessionData {
  user: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
    role: any;
  };
  secure?: {
    directusAccessToken?: string;
    directusRefreshToken?: string;
  };
  loggedInAt: number;
  expiresAt?: number;
}

/**
 * Get access token from session
 */
export function getSessionAccessToken(session: any): string | null {
  return session?.secure?.directusAccessToken || null;
}

/**
 * Get refresh token from session
 */
export function getSessionRefreshToken(session: any): string | null {
  return session?.secure?.directusRefreshToken || null;
}

/**
 * Update session with new tokens after refresh
 */
export async function updateSessionTokens(
  event: H3Event,
  session: any,
  tokens: DirectusTokens
): Promise<void> {
  const expiresAt = Date.now() + tokens.expires;

  await setUserSession(event, {
    ...session,
    secure: {
      ...session.secure,
      directusAccessToken: tokens.access_token,
      directusRefreshToken: tokens.refresh_token,
    },
    expiresAt,
  });
}

/**
 * Create a new user session after login
 */
export async function createUserSession(
  event: H3Event,
  user: UserSessionData["user"],
  tokens: DirectusTokens
): Promise<void> {
  const expiresAt = Date.now() + tokens.expires;

  await setUserSession(event, {
    user,
    secure: {
      directusAccessToken: tokens.access_token,
      directusRefreshToken: tokens.refresh_token,
    },
    loggedInAt: Date.now(),
    expiresAt,
  });
}

/**
 * Check if session is expired or about to expire
 */
export function isSessionExpired(session: any, bufferMs: number = 60000): boolean {
  const expiresAt = session?.expiresAt;
  if (!expiresAt) return false; // No expiration info, assume valid
  return Date.now() >= expiresAt - bufferMs;
}
