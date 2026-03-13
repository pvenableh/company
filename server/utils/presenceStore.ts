// server/utils/presenceStore.ts
/**
 * In-memory presence store for user online status.
 *
 * Maps userId → lastSeen timestamp (ms since epoch).
 * Entries expire after PRESENCE_TTL and are cleaned up on read.
 *
 * For single-server deployments this is sufficient.
 * For multi-server deployments, replace with Redis or similar shared store.
 */

/** TTL in milliseconds — users offline after this many ms without a heartbeat */
export const PRESENCE_TTL = 90_000; // 90 seconds

/**
 * Global in-memory presence store.
 * Survives across requests within the same Nitro server process.
 */
export const _presenceStore = new Map<string, number>();
