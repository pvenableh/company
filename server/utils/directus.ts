// server/utils/directus.ts
/**
 * Directus Server Utilities
 *
 * Provides server-side Directus client instances:
 * - getTypedDirectus(): Admin client with static token
 * - getUserDirectus(event): User client with session token
 * - getPublicDirectus(): Unauthenticated client
 */

import {
  createDirectus,
  rest,
  authentication,
  readMe,
  refresh as directusRefreshToken,
  login as directusLoginFn,
  logout as directusLogoutFn,
  type AuthenticationData,
  type DirectusClient,
  type RestClient,
  type AuthenticationClient,
} from "@directus/sdk";
import type { H3Event } from "h3";

// Type for authenticated client
type DirectusAuthClient = DirectusClient<any> &
  RestClient<any> &
  AuthenticationClient<any>;

/**
 * Get admin Directus client with static token
 * Use for server-side admin operations
 */
export function getTypedDirectus(): DirectusAuthClient {
  const config = useRuntimeConfig();
  const directusUrl = config.directus?.url || config.public.directusUrl;
  const staticToken = config.directus?.staticToken;

  if (!directusUrl) {
    throw new Error("DIRECTUS_URL not configured");
  }

  const client = createDirectus(directusUrl)
    .with(rest())
    .with(authentication("json"));

  if (staticToken) {
    client.setToken(staticToken);
  }

  return client;
}

/**
 * Get admin Directus client with server token (full admin access)
 * Use for migrations, schema operations, and admin tasks
 */
export function getServerDirectus(): DirectusAuthClient {
  const config = useRuntimeConfig();
  const directusUrl = config.directus?.url || config.public.directusUrl;
  const serverToken = (config.directus as any)?.serverToken || (config as any).directusServerToken;

  if (!directusUrl) {
    throw new Error("DIRECTUS_URL not configured");
  }

  if (!serverToken) {
    throw new Error("DIRECTUS_SERVER_TOKEN not configured — required for admin operations");
  }

  const client = createDirectus(directusUrl)
    .with(rest())
    .with(authentication("json"));

  client.setToken(serverToken);

  return client;
}

/**
 * Get user-authenticated Directus client
 * Token refresh is handled by the session plugin's "fetch" hook,
 * which runs when getUserSession() is called below.
 * If the token is still rejected, use withAuthRetry() to recover.
 */
export async function getUserDirectus(
  event: H3Event,
  forceRefresh: boolean = false
): Promise<DirectusAuthClient> {
  const config = useRuntimeConfig();
  const directusUrl = config.directus?.url || config.public.directusUrl;

  if (!directusUrl) {
    throw new Error("DIRECTUS_URL not configured");
  }

  const client = createDirectus(directusUrl)
    .with(rest())
    .with(authentication("json"));

  // getUserSession triggers the session "fetch" hook which refreshes
  // expired tokens automatically before we read them here.
  let session = await getUserSession(event);

  // If forceRefresh is requested, proactively refresh the token
  if (forceRefresh) {
    const refreshToken = getSessionRefreshToken(session);
    if (refreshToken) {
      try {
        const newTokens = await directusRefresh(refreshToken);
        await updateSessionTokens(event, session, newTokens);
        session = await getUserSession(event);
      } catch {
        // If refresh fails, continue with existing token
      }
    }
  }

  const accessToken = getSessionAccessToken(session);

  if (!accessToken) {
    throw createError({
      statusCode: 401,
      message: "Not authenticated",
    });
  }

  client.setToken(accessToken);
  return client;
}

/**
 * Get public (unauthenticated) Directus client
 */
export function getPublicDirectus(): DirectusAuthClient {
  const config = useRuntimeConfig();
  const directusUrl = config.directus?.url || config.public.directusUrl;

  if (!directusUrl) {
    throw new Error("DIRECTUS_URL not configured");
  }

  return createDirectus(directusUrl).with(rest()).with(authentication("json"));
}

/**
 * Login to Directus and return auth data
 */
export async function directusLogin(
  email: string,
  password: string
): Promise<AuthenticationData> {
  const client = getPublicDirectus();

  const result = await client.request(
    directusLoginFn({ email, password }, { mode: "json" })
  );

  if (!result?.access_token || !result?.refresh_token) {
    throw createError({
      statusCode: 401,
      message: "Invalid credentials",
    });
  }

  return result;
}

/**
 * Refresh Directus tokens
 */
export async function directusRefresh(
  refreshToken: string
): Promise<AuthenticationData> {
  const client = getPublicDirectus();

  const result = await client.request(
    directusRefreshToken({ mode: "json", refresh_token: refreshToken })
  );

  if (!result?.access_token || !result?.refresh_token) {
    throw createError({
      statusCode: 401,
      message: "Token refresh failed",
    });
  }

  return result;
}

/**
 * Logout from Directus
 */
export async function directusLogout(refreshToken: string): Promise<void> {
  try {
    const client = getPublicDirectus();
    await client.request(directusLogoutFn({ refresh_token: refreshToken, mode: "json" }));
  } catch (error) {
    // Ignore logout errors (token might already be invalid)
    console.warn("Directus logout error (ignored):", error);
  }
}

/**
 * Get current user from Directus using a raw access token
 * Used during login before session exists
 */
export async function directusGetMe(
  accessToken: string,
  fields?: string[]
) {
  const config = useRuntimeConfig();
  const directusUrl = config.directus?.url || config.public.directusUrl;

  const client = createDirectus(directusUrl)
    .with(rest())
    .with(authentication("json"));

  client.setToken(accessToken);

  return await client.request(
    readMe({
      fields: fields || [
        "*",
        "role.id",
        "role.name",
        "role.admin_access",
        "organizations.organizations_id.id",
        "organizations.organizations_id.name",
        "organizations.organizations_id.logo",
        "organizations.organizations_id.icon",
        "organizations.organizations_id.tickets",
        "organizations.organizations_id.projects",
      ],
    })
  );
}

/**
 * Get current user from Directus using session event
 */
export async function directusGetMeFromSession(event: H3Event) {
  const client = await getUserDirectus(event);

  return await client.request(
    readMe({
      fields: [
        "*",
        "role.id",
        "role.name",
        "role.admin_access",
        "organizations.organizations_id.id",
        "organizations.organizations_id.name",
        "organizations.organizations_id.logo",
        "organizations.organizations_id.icon",
        "organizations.organizations_id.tickets",
        "organizations.organizations_id.projects",
      ],
    })
  );
}

/**
 * Helper to make authenticated requests with auto-retry on 401
 */
export async function withAuthRetry<T>(
  event: H3Event,
  requestFn: (client: DirectusAuthClient) => Promise<T>
): Promise<T> {
  try {
    const client = await getUserDirectus(event);
    return await requestFn(client);
  } catch (error: any) {
    // If 401 and we have a refresh token, try refresh and retry
    if (error?.response?.status === 401 || error?.statusCode === 401) {
      const session = await getUserSession(event);
      const refreshToken = getSessionRefreshToken(session);

      if (refreshToken) {
        try {
          const result = await directusRefresh(refreshToken);

          await updateSessionTokens(event, session, {
            access_token: result.access_token!,
            refresh_token: result.refresh_token!,
            expires: result.expires ?? 900000,
          });

          // Retry with new token
          const client = await getUserDirectus(event);
          return await requestFn(client);
        } catch (refreshError) {
          await clearUserSession(event);
          throw createError({
            statusCode: 401,
            message: "Session expired",
          });
        }
      }
    }

    throw error;
  }
}
