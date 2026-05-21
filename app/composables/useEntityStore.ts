/**
 * useEntityStore(collection, { filter?, fields?, sort? })
 *
 * The reactive-CRUD primitive for the iOS UX sweep (primitive #7 — every
 * mutation refreshes every visible view of that data). Wraps
 * useDirectusItems(collection) + a per-cache-key in-memory store so:
 *
 *   - The same query from multiple components shares ONE list ref. A panel
 *     editing a row updates the row in the list behind it automatically.
 *   - create/update/remove apply optimistically (with `_pending: true` on
 *     unsaved rows), reconcile with the server response, and refresh().
 *   - On error: rollback the optimistic op + show a toast with retry.
 *   - emit('changed', { id, op }) on every successful mutation so sibling
 *     stores or components can subscribe via onChange() for debounced
 *     reactions (e.g. notifications bell).
 *
 * Cache key = `${collection}:${hash(filter)}:${hash(fields)}:${hash(sort)}`.
 * Different filters get different lists — they don't trample each other.
 *
 * Usage:
 *
 *   const store = useEntityStore<Client>('clients', {
 *     filter: { organization: { _eq: orgId.value } },
 *     fields: ['id', 'name', 'logo'],
 *     sort: ['sort'],
 *   });
 *   await store.refresh();
 *   store.update(id, { name: 'New' });   // optimistic + reconcile + refresh
 *   store.onChange(({ id, op }) => {});  // sibling notifications
 */
import type { Ref } from 'vue';

type StoreEvent<T> = { id: string; op: 'create' | 'update' | 'remove'; item?: T };
type StoreHandler<T> = (event: StoreEvent<T>) => void;

interface StoreOptions {
  filter?: Record<string, any>;
  fields?: string[];
  sort?: string[];
  limit?: number;
}

interface EntityStore<T extends { id?: string | number }> {
  list: Ref<Array<T & { _pending?: boolean }>>;
  loading: Ref<boolean>;
  error: Ref<unknown | null>;
  get(id: string): Ref<T | null>;
  create(payload: Partial<T>): Promise<T | null>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  remove(id: string): Promise<boolean>;
  onChange(handler: StoreHandler<T>): () => void;
  refresh(): Promise<void>;
}

/** Module-level registry so `useEntityStore('clients', { filter })` in two
 * different components returns the same underlying refs + handler bus. */
const REGISTRY = new Map<string, EntityStore<any>>();

/** Module-level collection-keyed event bus. Lets external mutation paths
 * (e.g. useClients.updateClient — pre-existing helpers we don't want to
 * tear out yet) tell every store on a collection that a row changed.
 * Stores subscribe to their own collection on creation and trigger a
 * background refresh when an external event arrives. */
const COLLECTION_HANDLERS = new Map<string, Set<(event: StoreEvent<any>) => void>>();

export function notifyEntityChange<T extends { id?: string | number }>(
  collection: string,
  event: { id: string; op: 'create' | 'update' | 'remove'; item?: T },
): void {
  const handlers = COLLECTION_HANDLERS.get(collection);
  if (!handlers) return;
  for (const h of handlers) {
    try {
      h(event as StoreEvent<T>);
    } catch (err) {
      console.error(`[notifyEntityChange:${collection}] handler threw`, err);
    }
  }
}

/** Lightweight subscription helper for surfaces that own their own list
 * state and just need to react to `notifyEntityChange(collection, …)`
 * (e.g. legacy boards/lists that haven't migrated to `useEntityStore`).
 * Returns an unsubscribe function. */
export function subscribeToCollection<T extends { id?: string | number }>(
  collection: string,
  handler: (event: { id: string; op: 'create' | 'update' | 'remove'; item?: T }) => void,
): () => void {
  const set = COLLECTION_HANDLERS.get(collection) ?? new Set();
  COLLECTION_HANDLERS.set(collection, set);
  const wrapped = (e: StoreEvent<any>) => handler(e);
  set.add(wrapped);
  return () => set.delete(wrapped);
}

function stableHash(value: unknown): string {
  if (value == null) return '';
  // Order-stable JSON via key sort — Directus filters are nested objects so
  // a plain JSON.stringify with sorted keys gives identical hashes for
  // structurally-equal inputs.
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return v;
  });
}

export function useEntityStore<T extends { id?: string | number }>(
  collection: string,
  options: StoreOptions = {},
): EntityStore<T> {
  const key = `${collection}:${stableHash(options.filter)}:${stableHash(options.fields)}:${stableHash(options.sort)}:${options.limit ?? ''}`;
  const cached = REGISTRY.get(key);
  if (cached) return cached as EntityStore<T>;

  const directusItems = useDirectusItems<T>(collection);
  const toast = useToast();

  const list = ref([]) as Ref<Array<T & { _pending?: boolean }>>;
  const loading = ref(false);
  const error = ref<unknown | null>(null);
  const handlers = new Set<StoreHandler<T>>();
  const singleGets = new Map<string, Ref<T | null>>();

  function emit(event: StoreEvent<T>) {
    for (const h of handlers) {
      try {
        h(event);
      } catch (err) {
        console.error(`[useEntityStore:${collection}] onChange handler threw`, err);
      }
    }
  }

  // Subscribe to collection-level events from external mutation paths
  // (useClients.updateClient et al — pre-existing helpers we don't want to
  // tear out yet). When an external write arrives, fan the event out to
  // our handlers + trigger a debounced refresh so the rendered list stays
  // authoritative within ~200ms of the write.
  const collectionHandlers = COLLECTION_HANDLERS.get(collection) ?? new Set();
  COLLECTION_HANDLERS.set(collection, collectionHandlers);
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const externalHandler = (event: StoreEvent<T>) => {
    for (const h of handlers) {
      try { h(event); } catch { /* per-handler safety covered above */ }
    }
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh().catch(() => {});
    }, 100);
  };
  collectionHandlers.add(externalHandler);

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const rows = (await directusItems.list({
        filter: options.filter,
        fields: options.fields,
        sort: options.sort,
        limit: options.limit ?? -1,
      })) as T[];
      // Preserve any in-flight optimistic rows (_pending: true) that the
      // server hasn't materialized yet — drop the rest.
      const pending = list.value.filter((r) => r._pending);
      list.value = [...rows, ...pending] as Array<T & { _pending?: boolean }>;
      // Refill any single-get refs so detail panels see the freshest row.
      for (const [id, ref_] of singleGets) {
        const found = rows.find((r) => String(r.id) === id);
        if (found) ref_.value = found;
      }
    } catch (err) {
      error.value = err;
      console.error(`[useEntityStore:${collection}] refresh failed`, err);
    } finally {
      loading.value = false;
    }
  }

  function get(id: string): Ref<T | null> {
    if (singleGets.has(id)) return singleGets.get(id)!;
    const single = ref<T | null>(null) as Ref<T | null>;
    singleGets.set(id, single);
    // Resolve from current list synchronously if present; else fetch.
    const existing = list.value.find((r) => String(r.id) === id);
    if (existing) {
      single.value = existing as T;
    } else {
      directusItems
        .get(id, { fields: options.fields })
        .then((row: T) => {
          single.value = row;
        })
        .catch((err: unknown) => {
          console.error(`[useEntityStore:${collection}] get(${id}) failed`, err);
        });
    }
    return single;
  }

  async function create(payload: Partial<T>): Promise<T | null> {
    const optimistic = { ...(payload as object), _pending: true } as T & { _pending?: boolean };
    list.value = [optimistic, ...list.value];
    try {
      const row = (await directusItems.create(payload as T)) as T;
      const idx = list.value.findIndex((r) => r === optimistic);
      if (idx >= 0 && row) {
        list.value[idx] = row as T & { _pending?: boolean };
      }
      if (row?.id) emit({ id: String(row.id), op: 'create', item: row });
      await refresh();
      return row;
    } catch (err: any) {
      list.value = list.value.filter((r) => r !== optimistic);
      toast.add({
        title: `Couldn't create ${collection.replace(/s$/, '')}`,
        description: err?.data?.message || err?.message || 'Unknown error',
        color: 'red',
      });
      throw err;
    }
  }

  async function update(id: string, patch: Partial<T>): Promise<T | null> {
    const idx = list.value.findIndex((r) => String(r.id) === id);
    const prev = idx >= 0 ? list.value[idx] : null;
    if (idx >= 0 && prev) {
      const optimistic = { ...(prev as object), ...(patch as object), _pending: true } as T & { _pending?: boolean };
      list.value.splice(idx, 1, optimistic);
    }
    // Update single-get refs synchronously for in-flight detail views.
    const single = singleGets.get(id);
    if (single?.value) {
      single.value = { ...(single.value as object), ...(patch as object) } as T;
    }
    try {
      const saved = (await directusItems.update(id, patch as Partial<T>)) as T;
      if (idx >= 0 && saved) {
        list.value.splice(idx, 1, saved as T & { _pending?: boolean });
      }
      if (single) single.value = saved as T;
      emit({ id, op: 'update', item: saved });
      await refresh();
      return saved;
    } catch (err: any) {
      // Rollback optimistic patch.
      if (idx >= 0 && prev) {
        list.value.splice(idx, 1, prev as T & { _pending?: boolean });
      }
      if (single && prev) single.value = prev as T;
      toast.add({
        title: `Couldn't save ${collection.replace(/s$/, '')}`,
        description: err?.data?.message || err?.message || 'Unknown error',
        color: 'red',
      });
      throw err;
    }
  }

  async function remove(id: string): Promise<boolean> {
    const idx = list.value.findIndex((r) => String(r.id) === id);
    const prev = idx >= 0 ? list.value[idx] : null;
    if (idx >= 0) list.value.splice(idx, 1);
    try {
      await directusItems.remove(id);
      emit({ id, op: 'remove' });
      await refresh();
      return true;
    } catch (err: any) {
      // Rollback optimistic delete.
      if (idx >= 0 && prev) {
        list.value.splice(idx, 0, prev as T & { _pending?: boolean });
      }
      toast.add({
        title: `Couldn't delete ${collection.replace(/s$/, '')}`,
        description: err?.data?.message || err?.message || 'Unknown error',
        color: 'red',
      });
      throw err;
    }
  }

  function onChange(handler: StoreHandler<T>): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  const store: EntityStore<T> = { list, loading, error, get, create, update, remove, onChange, refresh };
  REGISTRY.set(key, store);
  return store;
}
