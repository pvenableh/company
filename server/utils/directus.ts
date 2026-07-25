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
import { createHash } from "node:crypto";
import { getRedisConnection } from "./queue";

// Type for authenticated client
type DirectusAuthClient = DirectusClient<any> &
  RestClient<any> &
  AuthenticationClient<any>;

/**
 * Get admin Directus client with the server token.
 * Use for server-side admin operations (webhooks, cron, anything that runs
 * without a user session).
 *
 * Historically this used DIRECTUS_STATIC_TOKEN, but that token belonged to
 * a user with no role/policies — its writes only worked because the Public
 * policy granted anonymous writes. Those grants were revoked 2026-04-17,
 * so the static token is useless here and this now uses the server token
 * exclusively.
 */
export function getTypedDirectus(): DirectusAuthClient {
  const config = useRuntimeConfig();
  const directusUrl = config.directus?.url || config.public.directusUrl;
  const token = config.directus?.serverToken;

  if (!directusUrl) {
    throw new Error("DIRECTUS_URL not configured");
  }

  if (!token) {
    console.warn("[directus] DIRECTUS_SERVER_TOKEN not configured — admin client will be unauthenticated");
  }

  const client = createDirectus(directusUrl)
    .with(rest())
    .with(authentication("json"));

  if (token) {
    client.setToken(token);
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
  const session = await getUserSession(event);

  let accessToken = getSessionAccessToken(session);

  // Refresh when explicitly forced, or when the session is at/near expiry.
  //
  // Important: we do NOT trust a re-read of `session` to reflect the refresh.
  // `updateSessionTokens()` (and the fetch hook) persist new tokens via
  // `setUserSession()`, which writes a *new* object — the `session` reference
  // we hold here can still carry the stale (expired) access token. During a
  // client-side navigation burst, that stale token gets used, Directus rejects
  // it, and the request 500s (a hard refresh works because SSR refreshes
  // serially). So when we refresh, we use the returned token DIRECTLY.
  const needsRefresh = forceRefresh || isSessionExpired(session, 60000);
  if (needsRefresh) {
    const refreshToken = getSessionRefreshToken(session);
    if (refreshToken) {
      try {
        const newTokens = await dedupedDirectusRefresh(refreshToken);
        await updateSessionTokens(event, session, newTokens);
        accessToken = newTokens.access_token;
      } catch {
        // If refresh fails, fall through with whatever token we have and let
        // the downstream request surface the auth error.
      }
    }
  }

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
// A hung Directus refresh must never wedge the L1 in-flight entry or hold the
// L2 Redis lock indefinitely. Bound it BELOW the lock TTL so the elected rotator
// always resolves-or-fails within the lock window (no lock-expiry double-rotate).
// A timeout is TRANSIENT (not a dead token): it throws a plain Error with no
// statusCode, so callers map it to 503 and keep the session, rather than 401.
const DIRECTUS_REFRESH_TIMEOUT_MS = 8_000;

export async function directusRefresh(
  refreshToken: string
): Promise<AuthenticationData> {
  const client = getPublicDirectus();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    client.request(
      directusRefreshToken({ mode: "json", refresh_token: refreshToken })
    ),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("directus-refresh-timeout")),
        DIRECTUS_REFRESH_TIMEOUT_MS
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });

  if (!result?.access_token || !result?.refresh_token) {
    throw createError({
      statusCode: 401,
      message: "Token refresh failed",
    });
  }

  return result;
}

/** True when an error means Directus definitively rejected the token (dead). */
function isTokenRejected(err: any): boolean {
  const status = err?.response?.status ?? err?.statusCode;
  return status === 401 || status === 403;
}

/**
 * Deduplicated token refresh.
 *
 * Directus rotates refresh tokens: every successful /auth/refresh invalidates
 * the refresh token it was given and issues a new one. When several requests
 * land at once (e.g. the dashboard fires /api/ai/notices + /api/directus/users
 * + /api/directus/notifications in parallel, plus the socket's /api/websocket/
 * token re-auth and the client's proactive refresh timer) and the access token
 * has just expired, each one independently tries to refresh with the SAME
 * (still old) refresh token. Only the first wins; the rest hit an already-
 * rotated token, fail, and either surface as 500s or clear the session — which
 * is why navigation 500'd but a full SSR page load (one serial refresh) worked,
 * and why sessions dropped "for no reason" well before the 7-day TTL.
 *
 * Two layers of dedup:
 *
 *   L1 (in-process): collapses concurrent refreshes for the same token onto one
 *   network call and caches the result ~10s, so stragglers on THIS instance get
 *   the rotated tokens instead of re-refreshing a dead one.
 *
 *   L2 (cross-instance, Redis): on Vercel the app runs across many lambda
 *   instances that don't share L1's memory, so the race survived L1 — the fetch
 *   burst and the socket re-auth would land on different instances and fight
 *   over the single-use token. L2 elects ONE rotator via a Redis lock keyed by
 *   the token hash; everyone else waits for and reuses its published result.
 *   When Redis is absent (local dev, `REDIS_QUEUE_URL` unset) we fall back to
 *   L1-only, matching the previous behaviour.
 */
const inflightRefreshes = new Map<string, Promise<AuthenticationData>>();
const recentRefreshes = new Map<string, { data: AuthenticationData; at: number }>();
const RECENT_REFRESH_TTL_MS = 10_000;

// L2 (Redis) tunables. These are ORDERED deliberately:
//   directusRefresh timeout (8s) < lock TTL (10s) < poll budget (11s)
// so the elected rotator always resolves-or-fails BEFORE its lock auto-expires
// (no lock-expiry double-rotation), and a waiter never gives up before the lock
// would have released (no premature re-refresh of a token still being rotated).
const REDIS_RESULT_TTL_MS = 15_000; // success cache — outlives L1 for stragglers
const REDIS_DEAD_TTL_MS = 5_000; // dead-token tombstone — fast-fail waiters
const REDIS_LOCK_TTL_MS = 10_000; // > DIRECTUS_REFRESH_TIMEOUT_MS
const REDIS_POLL_TIMEOUT_MS = 11_000; // > REDIS_LOCK_TTL_MS
const REDIS_POLL_INTERVAL_MS = 100;
// The shared connection (server/utils/queue.ts) sets maxRetriesPerRequest:null
// for BullMQ, so a command issued while Redis is unreachable QUEUES indefinitely
// instead of failing fast. Auth must never hang on that — bound every op and
// degrade to a direct refresh on timeout.
const REDIS_OP_TIMEOUT_MS = 1_500;

// Sentinel published when the rotator confirms the token is dead (Directus 401/
// 403). Waiters that read it fail fast with a 401 instead of polling the full
// budget and then each stampeding Directus with the same dead token.
const DEAD_TOKEN_SENTINEL = "__dead__";
type CachedRefresh = AuthenticationData | { [DEAD_TOKEN_SENTINEL]: true };

function isDeadSentinel(v: any): boolean {
  return !!v && v[DEAD_TOKEN_SENTINEL] === true;
}

/** Hash the refresh token for use as a Redis key (avoid raw tokens in keyspace). */
function refreshKeyHash(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);
}

/** Bound a Redis op so a disconnected/queued command can't stall auth. */
function redisOp<T>(op: Promise<T>): Promise<T> {
  return Promise.race([
    op,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("redis-timeout")), REDIS_OP_TIMEOUT_MS)
    ),
  ]);
}

async function redisGetJson<T>(redis: any, key: string): Promise<T | null> {
  try {
    const raw = await redisOp(redis.get(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Interpret a cached L2 value: dead sentinel throws 401; tokens are returned. */
function resolveCached(v: CachedRefresh): AuthenticationData {
  if (isDeadSentinel(v)) {
    throw createError({ statusCode: 401, message: "Session expired - please log in again" });
  }
  return v as AuthenticationData;
}

/**
 * Cross-instance rotation. Returns the rotated tokens, ensuring at most one
 * instance actually calls Directus for a given refresh token within the window.
 * A confirmed-dead token is published as a tombstone so waiters fail fast; a
 * transient failure (timeout, Redis hiccup, 5xx) is NOT cached and propagates
 * so callers treat it as retryable (503), never as a logout.
 */
async function crossInstanceRefresh(
  refreshToken: string
): Promise<AuthenticationData> {
  const redis = getRedisConnection();
  if (!redis) return directusRefresh(refreshToken); // L1-only fallback

  const hash = refreshKeyHash(refreshToken);
  const resultKey = `authrt:${hash}`;
  const lockKey = `authrtlock:${hash}`;

  // A sibling on another instance may have already rotated (or tombstoned) it.
  const preHit = await redisGetJson<CachedRefresh>(redis, resultKey);
  if (preHit) return resolveCached(preHit);

  // Try to become the sole rotator. SET NX PX = atomic "acquire if free".
  let gotLock = false;
  try {
    const res = await redisOp(redis.set(lockKey, "1", "PX", REDIS_LOCK_TTL_MS, "NX"));
    gotLock = res === "OK";
  } catch {
    // Redis hiccup/timeout — degrade to a direct refresh rather than block auth.
    return directusRefresh(refreshToken);
  }

  if (gotLock) {
    try {
      // Double-checked locking: a prior holder may have published between our
      // preHit miss and acquiring the lock. Avoid a redundant rotation.
      const afterLock = await redisGetJson<CachedRefresh>(redis, resultKey);
      if (afterLock) return resolveCached(afterLock);

      try {
        const data = await directusRefresh(refreshToken);
        // Publish success for waiters (bounded, non-fatal on publish failure).
        try {
          await redisOp(
            redis.set(resultKey, JSON.stringify(data), "PX", REDIS_RESULT_TTL_MS)
          );
        } catch {}
        return data;
      } catch (err: any) {
        // Only a DEFINITIVE rejection tombstones the token. Transient failures
        // (timeout / network / 5xx) must not be cached — the token may still be
        // alive, and callers should get a retryable error, not a logout.
        if (isTokenRejected(err)) {
          try {
            await redisOp(
              redis.set(
                resultKey,
                JSON.stringify({ [DEAD_TOKEN_SENTINEL]: true }),
                "PX",
                REDIS_DEAD_TTL_MS
              )
            );
          } catch {}
        }
        throw err;
      }
    } finally {
      redisOp(redis.del(lockKey)).catch(() => {});
    }
  }

  // Someone else holds the lock — wait for their published result/tombstone.
  const deadline = Date.now() + REDIS_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, REDIS_POLL_INTERVAL_MS));
    const hit = await redisGetJson<CachedRefresh>(redis, resultKey);
    if (hit) return resolveCached(hit);
  }

  // Holder never published (crashed, or Directus was slow past our budget).
  // Last resort: attempt the rotation ourselves. If the token is genuinely
  // dead this 401s and the caller treats the session as expired.
  return directusRefresh(refreshToken);
}

export async function dedupedDirectusRefresh(
  refreshToken: string
): Promise<AuthenticationData> {
  const cached = recentRefreshes.get(refreshToken);
  if (cached && Date.now() - cached.at < RECENT_REFRESH_TTL_MS) {
    return cached.data;
  }

  const existing = inflightRefreshes.get(refreshToken);
  if (existing) return existing;

  const promise = crossInstanceRefresh(refreshToken)
    .then((data) => {
      recentRefreshes.set(refreshToken, { data, at: Date.now() });
      // Trim the recent cache opportunistically so it can't grow unbounded.
      for (const [key, value] of recentRefreshes) {
        if (Date.now() - value.at >= RECENT_REFRESH_TTL_MS) {
          recentRefreshes.delete(key);
        }
      }
      return data;
    })
    .finally(() => {
      inflightRefreshes.delete(refreshToken);
    });

  inflightRefreshes.set(refreshToken, promise);
  return promise;
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
          const result = await dedupedDirectusRefresh(refreshToken);

          await updateSessionTokens(event, session, {
            access_token: result.access_token!,
            refresh_token: result.refresh_token!,
            expires: result.expires ?? 900000,
          });

          // Retry with new token
          const client = await getUserDirectus(event);
          return await requestFn(client);
        } catch (refreshError) {
          // Do NOT clear the session here. In a cross-instance race a losing
          // data request could otherwise wipe a cookie a sibling just rotated
          // ("loser clears winner"). The client owns teardown (it re-checks the
          // cookie and only logs out on a definitive dead token). Surface a
          // definitive rejection as 401 and anything transient as 503 so the
          // caller keeps the session and can retry.
          if (isTokenRejected(refreshError)) {
            throw createError({ statusCode: 401, message: "Session expired" });
          }
          throw createError({
            statusCode: 503,
            message: "Could not refresh session, please retry",
          });
        }
      }
    }

    throw error;
  }
}
