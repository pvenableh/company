// composables/useRealtimeSubscription.js
// Multiplexed realtime subscription over a SHARED WebSocket connection.
//
// Strategy:
//   1. Fire a REST call immediately for fast initial data display
//   2. Register a WebSocket subscription (via useWebSocketManager) for live updates
//   3. WebSocket "init" event reconciles with latest server state (diff-based)
//   4. Live create/update/delete events keep data reactive
//   5. Optimistic event dedup prevents double-application from local mutations
//
// All subscriptions share a single WebSocket connection managed by useWebSocketManager.
// This reduces N connections per user down to 1.

import { consumeOptimisticEvent } from '~/composables/useDirectusItems';

// ─── Module-level REST-hydrate dedup (client-only) ───────────────────────────
// A board remount spins up a fresh composable instance whose connect() would
// re-fire POST /api/directus/items even though a sibling instance already holds
// the data and a live WS subscription for the same (collection, filter). These
// maps collapse those duplicate hydrates — the burst that, mid token-refresh,
// produced the 503 cascade + socket drop on back-navigation. Client-only: the
// composable early-returns on the server (import.meta.server guard below), so
// these are never touched during SSR and can't leak state across requests.
const _restHydrateInFlight = new Map(); // key -> Promise<any[]>
const _restHydrateDoneAt = new Map();   // key -> epoch ms of last success
const REST_HYDRATE_TTL_MS = 10_000;

export function useRealtimeSubscription(collection, fields, initialFilter, sort = '-date_created', initialData = null) {
	// ─── Core reactive state ─────────────────────────────────────────────────
	const data = ref(initialData || []);
	const isLoading = ref(initialData ? false : true);
	const isConnected = ref(false);
	const error = ref(null);
	const lastUpdated = ref(null);
	const currentFilter = ref(initialFilter);

	// ─── SSR guard ───────────────────────────────────────────────────────────
	if (import.meta.server) {
		return {
			data,
			isLoading,
			isConnected,
			error,
			lastUpdated,
			refresh: () => {},
			updateFilter: () => {},
			connect: () => {},
			disconnect: () => {},
			setData: () => {},
			currentFilter: readonly(currentFilter),
		};
	}

	// ─── Dependencies ────────────────────────────────────────────────────────
	const { loggedIn, session } = useUserSession();
	const manager = useWebSocketManager();

	// ─── Internal state ──────────────────────────────────────────────────────
	let _subHandle = null; // { uid, unsubscribe }
	let _restLoaded = false;

	const hasValidAuth = () => loggedIn.value;

	// Build the query object sent to WebSocket subscribe
	const buildWsQuery = () => ({
		fields,
		filter: currentFilter.value,
		sort,
	});

	// ─── REST initial load ───────────────────────────────────────────────────
	// Fires immediately for fast initial render while WebSocket connects.

	// Known-expired gate: if the client can already see the access token is at/past
	// expiry, skip the doomed REST hydrate and let the WS `init` reconcile once the
	// socket re-authenticates. Mirrors the server's isSessionExpired() 60s buffer.
	const isSessionKnownExpired = () => {
		const expiresAt = session.value?.expiresAt;
		if (!expiresAt) return false; // no info → assume valid
		return Date.now() >= expiresAt - 60_000;
	};

	// `force` (used by refresh()) bypasses the freshness cache to always hit the
	// network; the in-flight guard still applies so concurrent callers coalesce.
	const loadViaRest = async (force = false) => {
		if (!hasValidAuth()) {
			isLoading.value = false;
			return;
		}

		// Don't fire into a refresh storm when we already know the token is expired;
		// the WS `init` event hydrates us after the socket re-authenticates.
		if (isSessionKnownExpired()) {
			isLoading.value = false;
			return;
		}

		// Dedup key by (collection, filter). fields/sort are omitted: the WS `init`
		// reconciles each instance with its own query moments later, so the REST
		// hydrate is just a shared first-paint optimisation.
		const key = `${collection}:${JSON.stringify(currentFilter.value ?? {})}`;

		// A fresh success within the TTL — reuse it, don't re-fetch on remount.
		if (!force) {
			const doneAt = _restHydrateDoneAt.get(key);
			if (doneAt && Date.now() - doneAt < REST_HYDRATE_TTL_MS) {
				isLoading.value = false;
				return;
			}
		}

		// An in-flight hydrate for the same key — piggyback on it.
		const inflight = _restHydrateInFlight.get(key);
		if (inflight) {
			try {
				const result = await inflight;
				if (Array.isArray(result)) {
					data.value = result;
					_restLoaded = true;
				}
			} catch {
				// The owning instance already logged/handled the failure.
			} finally {
				isLoading.value = false;
			}
			return;
		}

		const promise = $fetch('/api/directus/items', {
			method: 'POST',
			body: {
				collection,
				operation: 'list',
				query: {
					fields,
					filter: currentFilter.value,
					sort: sort ? [sort] : undefined,
					// Cap initial REST hydrate. WebSocket then reconciles via `init`.
					// 200 covers every active board/list use we have today; raise per-caller
					// if a future consumer genuinely needs more than the freshest 200 rows.
					limit: 200,
				},
			},
		});
		_restHydrateInFlight.set(key, promise);

		try {
			const result = await promise;
			if (Array.isArray(result)) {
				data.value = result;
				_restLoaded = true;
			}
			_restHydrateDoneAt.set(key, Date.now());
			// Opportunistic trim so the done-map can't grow unbounded across filters.
			for (const [k, at] of _restHydrateDoneAt) {
				if (Date.now() - at >= REST_HYDRATE_TTL_MS) _restHydrateDoneAt.delete(k);
			}
		} catch (err) {
			// REST failure is non-fatal — WebSocket will still deliver data
			console.warn(`[Realtime:${collection}] REST initial load failed:`, err);
			if (data.value.length === 0 && !initialData) {
				error.value = err;
			}
		} finally {
			_restHydrateInFlight.delete(key);
			// Always stop the loading spinner after REST completes
			isLoading.value = false;
		}
	};

	// ─── Reconnection reconciliation ────────────────────────────────────────
	// On reconnect, the `init` event carries the full server state.
	// Instead of wholesale replacing local data (which causes UI flicker),
	// we diff the server state against the local state and apply only changes.

	let _hasReceivedInit = false; // Track whether we've received at least one init

	const reconcileInit = (serverData) => {
		if (!Array.isArray(serverData)) {
			data.value = serverData || [];
			return;
		}

		// First init — just accept the data
		if (!_hasReceivedInit || data.value.length === 0) {
			data.value = serverData;
			_hasReceivedInit = true;
			return;
		}

		// Subsequent init (reconnection) — diff against local state
		const localMap = new Map(data.value.map((item) => [item.id, item]));
		const serverMap = new Map(serverData.map((item) => [item.id, item]));

		let changed = false;
		const result = [];

		// Walk server items — detect new and updated items
		for (const [id, serverItem] of serverMap) {
			const localItem = localMap.get(id);
			if (!localItem) {
				// New item from server
				result.push(serverItem);
				changed = true;
			} else if (JSON.stringify(localItem) !== JSON.stringify(serverItem)) {
				// Updated item — use server version
				result.push(serverItem);
				changed = true;
			} else {
				// Unchanged — keep local reference (prevents reactive re-render)
				result.push(localItem);
			}
		}

		// Detect removed items (in local but not in server)
		if (localMap.size !== serverMap.size) {
			changed = true;
		} else {
			for (const id of localMap.keys()) {
				if (!serverMap.has(id)) {
					changed = true;
					break;
				}
			}
		}

		// Only update the ref if something actually changed
		if (changed) {
			data.value = result;
		}
	};

	// ─── WebSocket event handler (called by the shared manager) ──────────────

	const handleEvent = (event, eventData) => {
		switch (event) {
			case 'init':
				// Reconcile with local data instead of full replace (prevents flicker on reconnect)
				reconcileInit(eventData);
				_restLoaded = true;
				isLoading.value = false;
				break;

			case 'create':
				if (eventData?.[0]) {
					const newItem = eventData[0];
					// Skip if this was from our own optimistic create
					if (typeof consumeOptimisticEvent === 'function' &&
						consumeOptimisticEvent(collection, 'create', newItem.id)) {
						break;
					}
					// Avoid duplicates (item might already exist from REST or optimistic add)
					if (!data.value.some((item) => item.id === newItem.id)) {
						data.value = [...data.value, newItem];
					}
				}
				break;

			case 'update':
				if (eventData?.[0]) {
					const updated = eventData[0];
					// Skip if this was from our own optimistic update
					if (typeof consumeOptimisticEvent === 'function' &&
						consumeOptimisticEvent(collection, 'update', updated.id)) {
						break;
					}
					const id = updated.id;
					data.value = data.value.map((item) => (item.id === id ? updated : item));
				}
				break;

			case 'delete':
				if (Array.isArray(eventData)) {
					data.value = data.value.filter((item) => !eventData.includes(item.id));
				}
				break;
		}

		lastUpdated.value = new Date();
	};

	// ─── Connect / Disconnect ────────────────────────────────────────────────

	const connect = () => {
		if (!hasValidAuth()) {
			isLoading.value = false;
			return;
		}

		// Already subscribed
		if (_subHandle) return;

		// 1. Kick off REST for fast initial data (unless we already have initialData)
		if (!initialData || data.value.length === 0) {
			loadViaRest();
		} else {
			isLoading.value = false;
		}

		// 2. Register WebSocket subscription on the shared connection
		_subHandle = manager.subscribe(collection, buildWsQuery(), handleEvent);

		// Loading failsafe (prevent stuck spinners)
		setTimeout(() => {
			if (isLoading.value) isLoading.value = false;
		}, 8000);
	};

	const disconnect = () => {
		if (_subHandle) {
			_subHandle.unsubscribe();
			_subHandle = null;
		}
		isConnected.value = false;
	};

	// ─── Refresh ─────────────────────────────────────────────────────────────
	// Re-fetches from REST and resubscribes on WebSocket for full reconciliation.

	const refresh = () => {
		if (!hasValidAuth()) {
			isLoading.value = false;
			return;
		}

		isLoading.value = true;
		_restLoaded = false;

		// Re-fetch from REST — force past the freshness cache since this is an
		// explicit user/programmatic refresh.
		loadViaRest(true);

		// Resubscribe on WebSocket to get a fresh init event
		if (_subHandle) {
			manager.resubscribe(_subHandle.uid, buildWsQuery());
		} else {
			connect();
		}

		// Failsafe
		setTimeout(() => {
			if (isLoading.value) isLoading.value = false;
		}, 8000);
	};

	// ─── Update filter ───────────────────────────────────────────────────────

	const updateFilter = (newFilter) => {
		if (JSON.stringify(currentFilter.value) === JSON.stringify(newFilter)) {
			return;
		}

		currentFilter.value = newFilter;

		if (!hasValidAuth()) {
			isLoading.value = false;
			return;
		}

		isLoading.value = true;
		_restLoaded = false;

		// Re-fetch with new filter
		loadViaRest();

		// Resubscribe WebSocket with new filter
		if (_subHandle) {
			manager.resubscribe(_subHandle.uid, buildWsQuery());
		} else {
			connect();
		}
	};

	// ─── Set data manually ───────────────────────────────────────────────────

	const setData = (newData) => {
		data.value = newData;
		isLoading.value = false;
		lastUpdated.value = new Date();
	};

	// ─── Sync isConnected with shared manager ────────────────────────────────

	watch(
		manager.isConnected,
		(val) => {
			isConnected.value = val;
		},
		{ immediate: true },
	);

	// ─── Auth state changes ──────────────────────────────────────────────────

	watch(loggedIn, (isLoggedIn, wasLoggedIn) => {
		if (!isLoggedIn) {
			disconnect();
			data.value = [];
			isLoading.value = false;
		} else if (isLoggedIn && !wasLoggedIn && collection) {
			// Slight delay to let session settle after login
			setTimeout(() => {
				if (hasValidAuth()) connect();
			}, 500);
		}
	});

	// ─── Auto-connect if user is already logged in ───────────────────────────

	if (hasValidAuth()) {
		connect();
	}

	// ─── Auto-cleanup on scope dispose ───────────────────────────────────────

	if (getCurrentScope()) {
		onScopeDispose(() => {
			disconnect();
		});
	}

	// ─── Public API (unchanged from previous version) ────────────────────────

	return {
		data,
		isLoading,
		isConnected,
		error,
		lastUpdated,
		connect,
		disconnect,
		refresh,
		updateFilter,
		setData,
		currentFilter: readonly(currentFilter),
	};
}
