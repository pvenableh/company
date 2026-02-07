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

const CACHE_TTL = 5_000; // 5 seconds

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

function setCache(key: string, data: any): void {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/** Invalidate all cache entries for a given collection */
function invalidateCollection(collection: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${collection}:`)) {
      _cache.delete(key);
    }
  }
}

/**
 * Execute a read request with deduplication and caching.
 * Concurrent identical requests share the same in-flight promise.
 */
async function dedupedFetch<R>(
  cacheKey: string,
  fetchFn: () => Promise<R>
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
      setCache(cacheKey, result);
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
      })
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
      })
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
      })
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
  };
};
