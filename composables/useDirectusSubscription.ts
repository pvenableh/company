// composables/useDirectusSubscription.ts
/**
 * useDirectusSubscription - Reactive real-time subscription hook
 *
 * Provides a reactive way to subscribe to Directus collections with
 * automatic state management for items, loading, and errors.
 *
 * Usage:
 * const { items, loading, error, refresh } = useDirectusSubscription<Task>('tasks', {
 *   fields: ['id', 'title', 'status'],
 *   filter: { status: { _neq: 'archived' } }
 * })
 */

interface SubscriptionOptions {
  fields?: string[];
  filter?: Record<string, any>;
  immediate?: boolean;
}

export function useDirectusSubscription<T = any>(
  collection: string,
  options?: SubscriptionOptions
) {
  const { subscribe, isConnected, connectionError: wsError } = useDirectusRealtime();
  const items = useDirectusItems<T>(collection);

  // State
  const data = ref<T[]>([]) as Ref<T[]>;
  const loading = ref(false);
  const error = ref<string | null>(null);
  const isSubscribed = ref(false);

  let unsubscribeFn: (() => void) | null = null;

  /**
   * Fetch initial data
   */
  async function fetchInitialData() {
    loading.value = true;
    error.value = null;

    try {
      const result = await items.list({
        fields: options?.fields,
        filter: options?.filter,
      });
      data.value = result;
    } catch (e: any) {
      error.value = e.message || "Failed to fetch initial data";
    } finally {
      loading.value = false;
    }
  }

  /**
   * Start subscription
   */
  async function start() {
    if (isSubscribed.value) return;

    loading.value = true;
    error.value = null;

    try {
      // Fetch initial data first
      await fetchInitialData();

      // Then subscribe for updates
      unsubscribeFn = await subscribe(
        collection,
        (event, eventData) => {
          handleEvent(event, eventData as T | T[]);
        },
        {
          fields: options?.fields,
          filter: options?.filter,
        }
      );

      isSubscribed.value = true;
    } catch (e: any) {
      error.value = e.message || "Failed to start subscription";
    } finally {
      loading.value = false;
    }
  }

  /**
   * Handle real-time events
   */
  function handleEvent(event: "create" | "update" | "delete", eventData: T | T[]) {
    const eventItems = Array.isArray(eventData) ? eventData : [eventData];

    switch (event) {
      case "create":
        data.value = [...data.value, ...eventItems];
        break;

      case "update":
        data.value = data.value.map((item) => {
          const updated = eventItems.find((d: any) => d.id === (item as any).id);
          return updated || item;
        });
        break;

      case "delete":
        const deletedIds = eventItems.map((d: any) => d.id);
        data.value = data.value.filter((item: any) => !deletedIds.includes(item.id));
        break;
    }
  }

  /**
   * Stop subscription
   */
  function stop() {
    if (unsubscribeFn) {
      unsubscribeFn();
      unsubscribeFn = null;
    }
    isSubscribed.value = false;
  }

  /**
   * Refresh data (re-fetch and re-subscribe)
   */
  async function refresh() {
    stop();
    await start();
  }

  /**
   * Manually add an item (optimistic update)
   */
  function addItem(item: T) {
    data.value = [...data.value, item];
  }

  /**
   * Manually update an item (optimistic update)
   */
  function updateItem(id: string | number, updates: Partial<T>) {
    data.value = data.value.map((item) => {
      if ((item as any).id === id) {
        return { ...item, ...updates };
      }
      return item;
    });
  }

  /**
   * Manually remove an item (optimistic update)
   */
  function removeItem(id: string | number) {
    data.value = data.value.filter((item: any) => item.id !== id);
  }

  /**
   * Find item by ID
   */
  function findById(id: string | number): T | undefined {
    return data.value.find((item: any) => item.id === id);
  }

  // Auto-start if immediate
  if (options?.immediate !== false) {
    onMounted(() => start());
  }

  // Auto-cleanup
  onUnmounted(() => stop());

  // Watch for connection errors
  watch(wsError, (err) => {
    if (err) {
      error.value = err;
    }
  });

  return {
    // State
    items: readonly(data),
    data: readonly(data),
    loading: readonly(loading),
    error: readonly(error),
    isConnected,
    isSubscribed: readonly(isSubscribed),

    // Actions
    start,
    stop,
    refresh,

    // Optimistic updates
    addItem,
    updateItem,
    removeItem,

    // Helpers
    findById,
  };
}
