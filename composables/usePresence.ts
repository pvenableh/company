// composables/usePresence.ts
/**
 * User presence tracking via lightweight heartbeat.
 *
 * Uses a simple interval to POST the current user's status to a server endpoint,
 * and periodically fetches the list of online users. This avoids the complexity
 * of a dedicated WebSocket presence channel while providing reliable online/offline
 * status for team views, assignment dropdowns, and chat interfaces.
 *
 * Online status expires after PRESENCE_TTL (90s) if no heartbeat is received.
 */

interface PresenceEntry {
  userId: string;
  lastSeen: number;
}

// Module-level singleton state
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _fetchTimer: ReturnType<typeof setInterval> | null = null;
let _visibilityHandler: (() => void) | null = null;
let _initialized = false;

const HEARTBEAT_INTERVAL = 30_000;  // Send heartbeat every 30s
const FETCH_INTERVAL = 30_000;      // Fetch online users every 30s
const PRESENCE_TTL = 90_000;        // Consider offline after 90s without heartbeat

// Shared reactive state
const _onlineUsers = ref<Map<string, number>>(new Map());
const _isTracking = ref(false);

export function usePresence() {
  const { loggedIn } = useUserSession();
  const { user: sessionUser } = useUserSession();
  const user = computed(() => (loggedIn.value ? sessionUser.value : null));

  // ─── Heartbeat (send our presence) ──────────────────────────────────────

  const sendHeartbeat = async () => {
    if (!loggedIn.value || !user.value) return;

    try {
      await $fetch('/api/presence/heartbeat', {
        method: 'POST',
        body: { status: 'online' },
      });
    } catch {
      // Non-critical — silently ignore
    }
  };

  // ─── Fetch online users ─────────────────────────────────────────────────

  const fetchOnlineUsers = async () => {
    if (!loggedIn.value) return;

    try {
      const result = await $fetch<PresenceEntry[]>('/api/presence/online');
      if (Array.isArray(result)) {
        const now = Date.now();
        const newMap = new Map<string, number>();

        for (const entry of result) {
          // Only include users seen within PRESENCE_TTL
          if (now - entry.lastSeen < PRESENCE_TTL) {
            newMap.set(entry.userId, entry.lastSeen);
          }
        }

        _onlineUsers.value = newMap;
      }
    } catch {
      // Non-critical — silently ignore
    }
  };

  // ─── Start / Stop ─────────────────────────────────────────────────────────

  const startTimers = () => {
    if (_heartbeatTimer) return; // Already running
    _heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    _fetchTimer = setInterval(fetchOnlineUsers, FETCH_INTERVAL);
  };

  const stopTimers = () => {
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
    if (_fetchTimer) {
      clearInterval(_fetchTimer);
      _fetchTimer = null;
    }
  };

  const start = () => {
    if (_initialized || import.meta.server) return;
    _initialized = true;
    _isTracking.value = true;

    // Send initial heartbeat
    sendHeartbeat();
    fetchOnlineUsers();

    // Set up intervals
    startTimers();

    // Pause heartbeat when tab is hidden, resume when visible
    _visibilityHandler = () => {
      if (document.hidden) {
        stopTimers();
      } else if (loggedIn.value) {
        // Send immediate heartbeat on tab focus, then resume intervals
        sendHeartbeat();
        fetchOnlineUsers();
        startTimers();
      }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);
  };

  const stop = () => {
    stopTimers();

    if (_visibilityHandler) {
      document.removeEventListener('visibilitychange', _visibilityHandler);
      _visibilityHandler = null;
    }

    _initialized = false;
    _isTracking.value = false;
  };

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Check if a specific user is online */
  const isOnline = (userId: string): boolean => {
    const lastSeen = _onlineUsers.value.get(userId);
    if (!lastSeen) return false;
    return Date.now() - lastSeen < PRESENCE_TTL;
  };

  /** Computed set of online user IDs */
  const onlineUserIds = computed(() => {
    const now = Date.now();
    const ids = new Set<string>();
    for (const [userId, lastSeen] of _onlineUsers.value) {
      if (now - lastSeen < PRESENCE_TTL) {
        ids.add(userId);
      }
    }
    return ids;
  });

  /** Count of online users */
  const onlineCount = computed(() => onlineUserIds.value.size);

  // Auto-start when user logs in, stop + clear on logout
  if (import.meta.client) {
    watch(loggedIn, (isLoggedIn) => {
      if (isLoggedIn) {
        start();
      } else {
        stop();
        _onlineUsers.value = new Map();
      }
    }, { immediate: true });
  }

  return {
    onlineUserIds,
    onlineCount,
    isOnline,
    isTracking: readonly(_isTracking),
    refresh: fetchOnlineUsers,
  };
}
