// composables/useDirectusRealtime.ts
/**
 * useDirectusRealtime - WebSocket connection composable
 *
 * Handles realtime WebSocket connections to Directus with:
 * - Automatic reconnection with exponential backoff
 * - Connection state management
 * - Token refresh before connection
 *
 * Usage:
 * const { subscribe, unsubscribe, isConnected, connect, disconnect } = useDirectusRealtime()
 */

import { createDirectus, realtime, rest, authentication } from "@directus/sdk";

interface SubscriptionOptions {
  fields?: string[];
  filter?: Record<string, any>;
}

type SubscriptionCallback<T = any> = (
  event: "create" | "update" | "delete",
  data: T | T[]
) => void;

export function useDirectusRealtime() {
  const config = useRuntimeConfig();
  const { loggedIn } = useUserSession();

  // Connection state
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const connectionError = ref<string | null>(null);
  const reconnectAttempts = ref(0);
  const maxReconnectAttempts = 10;

  // Client and subscriptions
  let client: any = null;
  const subscriptions = new Map<string, { unsubscribe: () => void }>();

  /**
   * Connect to WebSocket with authentication
   */
  async function connect() {
    if (isConnected.value || isConnecting.value) return;

    if (!loggedIn.value) {
      connectionError.value = "Authentication required";
      return;
    }

    isConnecting.value = true;
    connectionError.value = null;

    try {
      // Get fresh token from server
      const { token } = await $fetch<{ token: string }>("/api/websocket/token");

      if (!token) {
        throw new Error("No access token available");
      }

      // Create WebSocket client
      const wsUrl =
        config.public.directus.websocketUrl ||
        config.public.directus.url.replace("http", "ws");

      client = createDirectus(wsUrl)
        .with(realtime())
        .with(rest())
        .with(authentication("json"));

      // Connect and authenticate
      await client.connect();
      await client.sendMessage({ type: "auth", access_token: token });

      isConnected.value = true;
      isConnecting.value = false;
      reconnectAttempts.value = 0;
      connectionError.value = null;

      console.log("WebSocket connected");
    } catch (error: any) {
      isConnecting.value = false;
      connectionError.value = error.message || "Connection failed";
      console.error("WebSocket connection error:", error);

      // Attempt reconnection
      if (reconnectAttempts.value < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000);
        reconnectAttempts.value++;
        setTimeout(connect, delay);
      }
    }
  }

  /**
   * Disconnect from WebSocket
   */
  async function disconnect() {
    if (client) {
      // Unsubscribe from all subscriptions
      for (const [uid, sub] of subscriptions) {
        sub.unsubscribe();
      }
      subscriptions.clear();

      await client.disconnect();
      client = null;
    }

    isConnected.value = false;
    isConnecting.value = false;
  }

  /**
   * Subscribe to collection changes
   */
  async function subscribe<T = any>(
    collection: string,
    callback: SubscriptionCallback<T>,
    options?: SubscriptionOptions
  ): Promise<() => void> {
    // Ensure connection
    if (!isConnected.value) {
      await connect();
    }

    if (!client || !isConnected.value) {
      throw new Error("WebSocket not connected");
    }

    const uid = `${collection}-${Date.now()}`;

    // Subscribe to collection
    const { subscription } = await client.subscribe(collection, {
      query: {
        fields: options?.fields || ["*"],
        filter: options?.filter,
      },
    });

    // Handle events
    const unsubscribeFn = () => {
      subscription.return?.();
      subscriptions.delete(uid);
    };

    subscriptions.set(uid, { unsubscribe: unsubscribeFn });

    // Process messages
    (async () => {
      for await (const message of subscription) {
        if (message.type === "subscription" && message.event) {
          callback(message.event as any, message.data);
        }
      }
    })();

    return unsubscribeFn;
  }

  /**
   * Unsubscribe from a specific subscription
   */
  function unsubscribe(uid: string) {
    const sub = subscriptions.get(uid);
    if (sub) {
      sub.unsubscribe();
      subscriptions.delete(uid);
    }
  }

  // Auto-disconnect on unmount
  onUnmounted(() => {
    disconnect();
  });

  return {
    // State
    isConnected: readonly(isConnected),
    isConnecting: readonly(isConnecting),
    connectionError: readonly(connectionError),

    // Actions
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
}
