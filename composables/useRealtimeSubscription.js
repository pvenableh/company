// composables/useRealtimeSubscription.js
// WebSocket token is fetched from /api/websocket/token server endpoint - never stored client-side

export function useRealtimeSubscription(collection, fields, initialFilter, sort = '-date_created', initialData = null) {
	// Core state
	const data = ref(initialData || []);
	const isLoading = ref(initialData ? false : true);
	const isConnected = ref(false);
	const error = ref(null);
	const lastUpdated = ref(null);

	// Internal state
	const connection = ref(null);
	const currentFilter = ref(initialFilter);
	const reconnectAttempts = ref(0);
	const reconnectTimer = ref(null);
	const maxReconnectAttempts = 5;
	const subscriptionId = ref(null);
	const authCheckTimer = ref(null);

	// Skip in SSR context
	if (process.server) {
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
			currentFilter: readonly(currentFilter),
		};
	}

	const config = useRuntimeConfig();
	const { loggedIn } = useUserSession();

	// ===== Authentication =====

	// Check if we have valid auth before attempting connection
	const hasValidAuth = () => {
		if (!loggedIn.value) {
			return false;
		}
		return true;
	};

	// Fetch a fresh token from server for WebSocket auth
	const fetchWebSocketToken = async () => {
		try {
			const response = await $fetch('/api/websocket/token');
			return response?.token || null;
		} catch (error) {
			console.error('[WebSocket] Failed to fetch token:', error);
			return null;
		}
	};

	// ===== Core Functions =====

	// Build the subscription query
	const getQuery = () => ({
		fields,
		filter: currentFilter.value,
		sort,
	});

	// Connect to WebSocket server
	const connect = () => {
		// Don't connect if we don't have valid auth
		if (!hasValidAuth()) {
			isLoading.value = false;
			return;
		}

		// Prevent multiple connections
		if (connection.value && connection.value.readyState < 2) {
			return;
		}

		try {
			connection.value = new WebSocket(config.public.websocketUrl);

			// Event handlers
			connection.value.addEventListener('open', () => {
				isConnected.value = true;
				reconnectAttempts.value = 0;
				authenticate();
			});

			connection.value.addEventListener('message', handleMessage);

			connection.value.addEventListener('close', (event) => {
				isConnected.value = false;

				// Only attempt reconnect if we still have valid auth
				if (!event.wasClean && hasValidAuth()) {
					scheduleTryReconnect();
				} else {
					isLoading.value = false;
				}
			});

			connection.value.addEventListener('error', (event) => {
				console.error('[WebSocket] Connection error:', event);
				error.value = new Error('WebSocket connection error');
				isConnected.value = false;

				if (hasValidAuth()) {
					scheduleTryReconnect();
				} else {
					isLoading.value = false;
				}
			});
		} catch (err) {
			console.error('[WebSocket] Failed to create connection:', err);
			error.value = err;
			isLoading.value = false;
		}
	};

	// Disconnect from WebSocket server
	const disconnect = () => {
		// Clear any reconnection timer
		if (reconnectTimer.value) {
			clearTimeout(reconnectTimer.value);
			reconnectTimer.value = null;
		}

		// Clear auth check timer
		if (authCheckTimer.value) {
			clearInterval(authCheckTimer.value);
			authCheckTimer.value = null;
		}

		// Close connection if it exists
		if (connection.value) {
			try {
				if (connection.value.readyState < 2) {
					connection.value.close(1000, 'Intentional disconnect');
				}
			} catch (e) {
				console.error('[WebSocket] Error during disconnect:', e);
			}
			connection.value = null;
		}

		isConnected.value = false;
		subscriptionId.value = null;
	};

	// Schedule reconnection with exponential backoff
	const scheduleTryReconnect = () => {
		if (reconnectTimer.value) {
			clearTimeout(reconnectTimer.value);
			reconnectTimer.value = null;
		}

		if (reconnectAttempts.value >= maxReconnectAttempts) {
			error.value = new Error('Could not connect after several attempts');
			isLoading.value = false;
			return;
		}

		if (!hasValidAuth()) {
			isLoading.value = false;
			return;
		}

		const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 16000);

		reconnectTimer.value = setTimeout(() => {
			reconnectAttempts.value++;
			connect();
		}, delay);
	};

	// Authenticate using token from server endpoint
	const authenticate = async () => {
		if (!connection.value || connection.value.readyState !== 1) {
			return;
		}

		if (!hasValidAuth()) {
			error.value = new Error('Authentication failed - not logged in');
			isLoading.value = false;
			return;
		}

		// Fetch token from server endpoint
		const token = await fetchWebSocketToken();

		if (!token) {
			console.error('[WebSocket] No authentication token available');
			error.value = new Error('No authentication token available');
			isLoading.value = false;
			return;
		}

		connection.value.send(
			JSON.stringify({
				type: 'auth',
				access_token: token,
			}),
		);
	};

	// Subscribe to collection
	const subscribe = () => {
		if (!connection.value || connection.value.readyState !== 1) {
			return;
		}

		// If we have a previous subscription, unsubscribe first
		if (subscriptionId.value) {
			connection.value.send(
				JSON.stringify({
					type: 'unsubscribe',
					subscription: subscriptionId.value,
				}),
			);
			subscriptionId.value = null;
		}

		const uid = Math.random().toString(36).substring(2, 15);

		connection.value.send(
			JSON.stringify({
				type: 'subscribe',
				collection,
				query: getQuery(),
				uid,
			}),
		);
	};

	// Handle incoming WebSocket messages
	const handleMessage = (event) => {
		try {
			const message = JSON.parse(event.data);

			switch (message.type) {
				case 'auth':
					handleAuthResponse(message);
					break;

				case 'subscribe':
					handleSubscribeResponse(message);
					break;

				case 'subscription':
					handleSubscriptionData(message);
					break;

				case 'ping':
					handlePing();
					break;

				default:
					break;
			}
		} catch (err) {
			console.error('[WebSocket] Error processing message:', err);
			error.value = err;
		}
	};

	// Handle authentication response
	const handleAuthResponse = (message) => {
		if (message.status === 'ok') {
			subscribe();
		} else {
			console.error('[WebSocket] Authentication failed:', message.reason || 'Unknown reason');
			error.value = new Error(`Authentication failed: ${message.reason || 'Unknown reason'}`);
			isLoading.value = false;

			if (message.reason?.includes('invalid') || message.reason?.includes('expired')) {
				disconnect();
			}
		}
	};

	// Handle subscribe response
	const handleSubscribeResponse = (message) => {
		if (message.status === 'ok') {
			subscriptionId.value = message.subscription;
		} else {
			console.error('[WebSocket] Subscription failed:', message.reason || 'Unknown reason');
			error.value = new Error(`Subscription failed: ${message.reason || 'Unknown reason'}`);
			isLoading.value = false;
		}
	};

	// Handle subscription data updates
	const handleSubscriptionData = (message) => {
		switch (message.event) {
			case 'init':
				if (!initialData || data.value.length === 0) {
					data.value = message.data || [];
				}
				isLoading.value = false;
				break;

			case 'create':
				if (message.data && message.data[0]) {
					data.value = [...data.value, message.data[0]];
				}
				break;

			case 'update':
				if (message.data && message.data[0]) {
					const id = message.data[0].id;
					data.value = data.value.map((item) => (item.id === id ? message.data[0] : item));
				}
				break;

			case 'delete':
				if (message.data && Array.isArray(message.data)) {
					data.value = data.value.filter((item) => !message.data.includes(item.id));
				}
				break;
		}

		lastUpdated.value = new Date();
	};

	// Handle ping messages
	const handlePing = () => {
		if (!connection.value || connection.value.readyState !== 1) return;
		connection.value.send(JSON.stringify({ type: 'pong' }));
	};

	// ===== Public API =====

	// Refresh the subscription
	const refresh = () => {
		if (!hasValidAuth()) {
			isLoading.value = false;
			return;
		}

		isLoading.value = true;

		if (!connection.value || connection.value.readyState !== 1) {
			reconnectAttempts.value = 0;
			connect();
		} else {
			subscribe();
		}

		// Failsafe for stuck loading state
		setTimeout(() => {
			if (isLoading.value) {
				isLoading.value = false;
			}
		}, 8000);
	};

	// Update the filter and refresh subscription
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

		if (connection.value && connection.value.readyState === 1) {
			subscribe();
		} else {
			connect();
		}
	};

	// Set new data manually
	const setData = (newData) => {
		data.value = newData;
		isLoading.value = false;
		lastUpdated.value = new Date();
	};

	// ===== Lifecycle Management =====

	// Watch for auth status changes
	watch(
		loggedIn,
		(isLoggedIn, wasLoggedIn) => {
			if (!isLoggedIn) {
				disconnect();
				data.value = [];
				isLoading.value = false;
			} else if (isLoggedIn && !wasLoggedIn) {
				if (collection) {
					setTimeout(() => {
						if (hasValidAuth()) {
							connect();
						}
					}, 1000);
				}
			}
		},
	);

	// Set up periodic auth check
	if (import.meta.client) {
		authCheckTimer.value = setInterval(() => {
			if (isConnected.value && !hasValidAuth()) {
				disconnect();
			}
		}, 30000);
	}

	// Return the public API
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
