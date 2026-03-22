// composables/useDirectusItems.ts
/**
 * useDirectusItems - Generic CRUD composable for any Directus collection
 *
 * Collection-agnostic composable that provides list, get, create, update,
 * delete, and aggregate operations for any Directus collection.
 *
 * Features:
 * - Request deduplication: concurrent identical read requests share the same promise
 * - Short-lived cache: read results cached for 5s to avoid redundant fetches
 * - Automatic cache invalidation on mutations (create, update, delete)
 *
 * Usage:
 * const posts = useDirectusItems('posts')
 * const items = await posts.list({ filter: { status: { _eq: 'published' } } })
 * const item = await posts.get('item-id')
 * const newItem = await posts.create({ title: 'Hello' })
 * const updated = await posts.update('item-id', { title: 'Updated' })
 * await posts.remove('item-id')
 */

export interface ItemsQuery {
  fields?: string[];
  filter?: Record<string, any>;
  sort?: string[];
  limit?: number;
  offset?: number;
  page?: number;
  search?: string;
  deep?: Record<string, any>;
  aggregate?: Record<string, string[]>;
  groupBy?: string[];
}

// ─── Module-level request dedup & cache ──────────────────────────────────────

const DEFAULT_CACHE_TTL = 5_000; // 5 seconds

/**
 * Per-collection cache TTL overrides.
 * High-churn collections get shorter TTL, stable collections get longer TTL.
 */
const COLLECTION_TTL: Record<string, number> = {
  // Stable collections — cache longer
  org_roles: 60_000,       // 60s — rarely changes
  clients: 30_000,         // 30s — changes infrequently
  organizations: 30_000,   // 30s
  teams: 30_000,           // 30s
  org_memberships: 30_000, // 30s
  goals: 10_000,           // 10s — user-managed goals
  goal_snapshots: 10_000,  // 10s
  expenses: 10_000,        // 10s — user-managed expenses
  ai_preferences: 30_000,  // 30s — AI settings
  // High-churn collections — shorter TTL
  messages: 2_000,         // 2s — real-time chat
  notifications: 2_000,    // 2s — need near-instant updates
  directus_notifications: 2_000,
  comments: 3_000,         // 3s
  // Everything else uses DEFAULT_CACHE_TTL (5s)
};

function getCollectionTTL(collection: string): number {
  return COLLECTION_TTL[collection] ?? DEFAULT_CACHE_TTL;
}

interface CacheEntry {
  data: any;
  expiresAt: number;
}

/** In-flight read requests keyed by serialized request params */
const _inflight = new Map<string, Promise<any>>();

/** Short-lived cache for read responses */
const _cache = new Map<string, CacheEntry>();

function makeCacheKey(
  collection: string,
  operation: string,
  params: any
): string {
  return `${collection}:${operation}:${JSON.stringify(params)}`;
}

function getCached(key: string): any | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key: string, data: any, ttl: number): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}

/** Invalidate all cache entries for a given collection */
function invalidateCollection(collection: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${collection}:`)) {
      _cache.delete(key);
    }
  }
}

// ─── Periodic cache sweep ─────────────────────────────────────────────────────
// Evict expired entries every 30s to prevent unbounded Map growth from
// varied query filters (pagination, search, date ranges).
const SWEEP_INTERVAL = 30_000;
const MAX_CACHE_SIZE = 500;

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _cache) {
      if (now > entry.expiresAt) _cache.delete(key);
    }
    // Hard cap: if still too large after expiry sweep, drop oldest entries
    if (_cache.size > MAX_CACHE_SIZE) {
      const entries = [..._cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toRemove = entries.slice(0, _cache.size - MAX_CACHE_SIZE);
      for (const [key] of toRemove) _cache.delete(key);
    }
  }, SWEEP_INTERVAL);
}

// ─── Optimistic update event bus ──────────────────────────────────────────────
// Emits events when optimistic mutations happen, so realtime subscriptions
// can avoid double-applying the same change when the server confirms it.

type OptimisticEvent = {
  type: 'create' | 'update' | 'delete';
  collection: string;
  id?: string | number;
  data?: any;
  timestamp: number;
};

const _optimisticEvents: OptimisticEvent[] = [];
const OPTIMISTIC_EVENT_TTL = 10_000; // 10s — discard stale events

function _emitOptimistic(event: OptimisticEvent): void {
  _optimisticEvents.push(event);
  // Prune old events
  const cutoff = Date.now() - OPTIMISTIC_EVENT_TTL;
  while (_optimisticEvents.length > 0 && _optimisticEvents[0].timestamp < cutoff) {
    _optimisticEvents.shift();
  }
}

/**
 * Check if an optimistic event exists for a given operation.
 * Used by realtime subscriptions to skip double-application.
 */
export function hasRecentOptimisticEvent(
  collection: string,
  type: 'create' | 'update' | 'delete',
  id?: string | number
): boolean {
  const cutoff = Date.now() - OPTIMISTIC_EVENT_TTL;
  return _optimisticEvents.some(
    (e) =>
      e.collection === collection &&
      e.type === type &&
      e.timestamp > cutoff &&
      (id === undefined || e.id === id)
  );
}

/**
 * Consume (remove) a matched optimistic event so future checks don't find it.
 */
export function consumeOptimisticEvent(
  collection: string,
  type: 'create' | 'update' | 'delete',
  id?: string | number
): boolean {
  const cutoff = Date.now() - OPTIMISTIC_EVENT_TTL;
  const idx = _optimisticEvents.findIndex(
    (e) =>
      e.collection === collection &&
      e.type === type &&
      e.timestamp > cutoff &&
      (id === undefined || e.id === id)
  );
  if (idx !== -1) {
    _optimisticEvents.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Execute a read request with deduplication and caching.
 * Concurrent identical requests share the same in-flight promise.
 * @param cacheKey - Unique key for this request
 * @param fetchFn - Function that performs the actual fetch
 * @param ttl - Cache time-to-live in milliseconds
 */
async function dedupedFetch<R>(
  cacheKey: string,
  fetchFn: () => Promise<R>,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<R> {
  // 1. Return from cache if fresh
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached as R;

  // 2. Join existing in-flight request
  const existing = _inflight.get(cacheKey);
  if (existing) return existing as Promise<R>;

  // 3. Create new request, store in inflight map
  const promise = fetchFn()
    .then((result) => {
      setCache(cacheKey, result, ttl);
      return result;
    })
    .finally(() => {
      _inflight.delete(cacheKey);
    });

  _inflight.set(cacheKey, promise);
  return promise;
}

// ─── Composable ──────────────────────────────────────────────────────────────

export const useDirectusItems = <T = any>(
  collection: string,
  options: { requireAuth?: boolean } = {}
) => {
  const { requireAuth = true } = options;
  const { loggedIn } = useUserSession();

  const ttl = getCollectionTTL(collection);

  /**
   * List items from collection
   */
  const list = async (query: ItemsQuery = {}): Promise<T[]> => {
    if (requireAuth && !loggedIn.value) {
      throw new Error("Authentication required");
    }

    const cacheKey = makeCacheKey(collection, "list", query);

    return dedupedFetch(cacheKey, () =>
      $fetch("/api/directus/items", {
        method: "POST",
        body: {
          collection,
          operation: "list",
          query,
        },
      }),
      ttl
    ) as Promise<T[]>;
  };

  /**
   * Get single item by ID
   */
  const get = async (
    id: string | number,
    query: Pick<ItemsQuery, "fields" | "deep"> = {}
  ): Promise<T> => {
    if (requireAuth && !loggedIn.value) {
      throw new Error("Authentication required");
    }

    const cacheKey = makeCacheKey(collection, "get", { id, ...query });

    return dedupedFetch(cacheKey, () =>
      $fetch("/api/directus/items", {
        method: "POST",
        body: {
          collection,
          operation: "get",
          id,
          query,
        },
      }),
      ttl
    ) as Promise<T>;
  };

  /**
   * Create new item
   */
  const create = async (
    data: Partial<T>,
    query: Pick<ItemsQuery, "fields"> = {}
  ): Promise<T> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const result = await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "create",
        data,
        query,
      },
    });

    invalidateCollection(collection);
    return result as T;
  };

  /**
   * Update existing item
   */
  const update = async (
    id: string | number,
    data: Partial<T>,
    query: Pick<ItemsQuery, "fields"> = {}
  ): Promise<T> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const result = await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "update",
        id,
        data,
        query,
      },
    });

    invalidateCollection(collection);
    return result as T;
  };

  /**
   * Delete item(s)
   */
  const remove = async (
    id: string | number | (string | number)[]
  ): Promise<boolean> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "delete",
        id,
      },
    });

    invalidateCollection(collection);
    return true;
  };

  /**
   * Aggregate data
   */
  const aggregate = async (
    query: Pick<ItemsQuery, "aggregate" | "groupBy" | "filter">
  ) => {
    if (requireAuth && !loggedIn.value) {
      throw new Error("Authentication required");
    }

    const cacheKey = makeCacheKey(collection, "aggregate", query);

    return dedupedFetch(cacheKey, () =>
      $fetch("/api/directus/items", {
        method: "POST",
        body: {
          collection,
          operation: "aggregate",
          query,
        },
      }),
      ttl
    );
  };

  /**
   * Count items matching filter
   */
  const count = async (filter?: Record<string, any>): Promise<number> => {
    const result = await aggregate({
      aggregate: { count: ["*"] },
      filter,
    });

    const data = result as any[];
    return data?.[0]?.count || 0;
  };

  /**
   * Manually invalidate the cache for this collection
   */
  const invalidateCache = (): void => {
    invalidateCollection(collection);
  };

  // ── Optimistic mutations ────────────────────────────────────────────────
  // Immediately update the local cache, fire the API call,
  // and rollback on failure. Emits events so realtime subscriptions
  // can skip the server's confirmation of the same change.

  /**
   * Optimistically create an item.
   * Immediately injects the item into all cached list results for this
   * collection, then fires the server create. Rolls back on failure.
   * @param data - Item data (should include any client-generated temp ID)
   * @param query - Optional fields to return from server
   * @returns The server-confirmed item (or throws on failure after rollback)
   */
  const optimisticCreate = async (
    data: Partial<T>,
    query: Pick<ItemsQuery, "fields"> = {}
  ): Promise<T> => {
    if (!loggedIn.value) throw new Error("Authentication required");

    // Generate a temporary ID for the optimistic item
    const tempId = `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimisticItem = { id: tempId, ...data, date_created: new Date().toISOString() } as T;

    // Snapshot current list caches to enable rollback
    const listSnapshots = new Map<string, any>();
    for (const [key, entry] of _cache.entries()) {
      if (key.startsWith(`${collection}:list:`)) {
        listSnapshots.set(key, entry.data);
        // Append optimistic item to cached list
        if (Array.isArray(entry.data)) {
          setCache(key, [...entry.data, optimisticItem], ttl);
        }
      }
    }

    // Emit optimistic event
    _emitOptimistic({ type: 'create', collection, id: tempId, data: optimisticItem, timestamp: Date.now() });

    try {
      const result = await $fetch("/api/directus/items", {
        method: "POST",
        body: { collection, operation: "create", data, query },
      });

      // Server confirmed — replace temp item in caches with real item
      invalidateCollection(collection);
      return result as T;
    } catch (err) {
      // Rollback — restore original list caches
      for (const [key, snapshot] of listSnapshots) {
        setCache(key, snapshot, ttl);
      }
      throw err;
    }
  };

  /**
   * Optimistically update an item.
   * Immediately patches the item in all cached list and get results,
   * then fires the server update. Rolls back on failure.
   */
  const optimisticUpdate = async (
    id: string | number,
    data: Partial<T>,
    query: Pick<ItemsQuery, "fields"> = {}
  ): Promise<T> => {
    if (!loggedIn.value) throw new Error("Authentication required");

    // Snapshot and patch list caches
    const listSnapshots = new Map<string, any>();
    for (const [key, entry] of _cache.entries()) {
      if (key.startsWith(`${collection}:list:`) || key.startsWith(`${collection}:get:`)) {
        listSnapshots.set(key, entry.data);

        if (Array.isArray(entry.data)) {
          // Patch matching item in list
          setCache(
            key,
            entry.data.map((item: any) => (item.id === id ? { ...item, ...data } : item)),
            ttl
          );
        } else if (entry.data && (entry.data as any).id === id) {
          // Patch single-item get cache
          setCache(key, { ...entry.data, ...data }, ttl);
        }
      }
    }

    // Emit optimistic event
    _emitOptimistic({ type: 'update', collection, id, data, timestamp: Date.now() });

    try {
      const result = await $fetch("/api/directus/items", {
        method: "POST",
        body: { collection, operation: "update", id, data, query },
      });

      invalidateCollection(collection);
      return result as T;
    } catch (err) {
      // Rollback
      for (const [key, snapshot] of listSnapshots) {
        setCache(key, snapshot, ttl);
      }
      throw err;
    }
  };

  return {
    list,
    get,
    create,
    update,
    remove,
    delete: remove,
    aggregate,
    count,
    invalidateCache,
    optimisticCreate,
    optimisticUpdate,
  };
};
