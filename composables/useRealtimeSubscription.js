// composables/useRealtimeSubscription.js
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
	const subscriptionId = ref(null); // Track the current subscription ID

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

	// ===== Core Functions =====

	// Build the subscription query
	const getQuery = () => ({
		fields,
		filter: currentFilter.value,
		sort,
	});

	// Connect to WebSocket server
	const connect = () => {
		// Prevent multiple connections
		if (connection.value && connection.value.readyState < 2) return;

		try {
			console.log(`[WebSocket] Connecting to ${config.public.websocketUrl}`);
			connection.value = new WebSocket(config.public.websocketUrl);

			// Event handlers
			connection.value.addEventListener('open', () => {
				console.log('[WebSocket] Connection opened');
				isConnected.value = true;
				reconnectAttempts.value = 0;
				authenticate();
			});

			connection.value.addEventListener('message', handleMessage);

			connection.value.addEventListener('close', (event) => {
				console.log(`[WebSocket] Connection closed (${event.code}: ${event.reason})`);
				isConnected.value = false;
				if (!event.wasClean) scheduleTryReconnect();
			});

			connection.value.addEventListener('error', (event) => {
				console.error('[WebSocket] Connection error:', event);
				error.value = new Error('WebSocket connection error');
				isConnected.value = false;
				scheduleTryReconnect();
			});
		} catch (err) {
			console.error('[WebSocket] Failed to create connection:', err);
			error.value = err;
			scheduleTryReconnect();
		}
	};

	// Disconnect from WebSocket server
	const disconnect = () => {
		// Clear any reconnection timer
		if (reconnectTimer.value) {
			clearTimeout(reconnectTimer.value);
			reconnectTimer.value = null;
		}

		// Close connection if it exists
		if (connection.value) {
			try {
				// Only close if not already closed
				if (connection.value.readyState < 2) {
					connection.value.close(1000, 'Intentional disconnect');
				}
			} catch (e) {
				console.error('[WebSocket] Error during disconnect:', e);
			}
			connection.value = null;
		}

		isConnected.value = false;
		subscriptionId.value = null; // Clear the subscription ID
	};

	// Schedule reconnection with exponential backoff
	const scheduleTryReconnect = () => {
		// Clear any existing timer
		if (reconnectTimer.value) {
			clearTimeout(reconnectTimer.value);
			reconnectTimer.value = null;
		}

		// Check if max attempts reached
		if (reconnectAttempts.value >= maxReconnectAttempts) {
			console.warn('[WebSocket] Max reconnection attempts reached');
			error.value = new Error('Could not connect after several attempts');
			isLoading.value = false;
			return;
		}

		// Calculate backoff delay: 1s, 2s, 4s, 8s, 16s
		const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 16000);
		console.log(`[WebSocket] Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts.value + 1})`);

		// Schedule reconnection
		reconnectTimer.value = setTimeout(() => {
			reconnectAttempts.value++;
			connect();
		}, delay);
	};

	// Authenticate with the server
	const authenticate = () => {
		if (!connection.value || connection.value.readyState !== 1) return;

		console.log('[WebSocket] Authenticating...');
		let token = null;

		if (import.meta.client) {
			// Try localStorage first (may be more up-to-date from recent refresh)
			token = localStorage.getItem('auth_token');

			// If no token in localStorage or it looks invalid (less than 20 chars),
			// use the static token as fallback
			if (!token || token.length < 20) {
				token = config.public.staticToken;
				console.log('[WebSocket] Using static token (auth token not found in localStorage)');
			} else {
				console.log('[WebSocket] Using token from localStorage');
			}
		} else {
			// Server-side, use static token
			token = config.public.staticToken;
			console.log('[WebSocket] Using static token (server-side)');
		}

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
		if (!connection.value || connection.value.readyState !== 1) return;

		// If we have a previous subscription, unsubscribe first
		if (subscriptionId.value) {
			console.log(`[WebSocket] Unsubscribing from previous subscription: ${subscriptionId.value}`);
			connection.value.send(
				JSON.stringify({
					type: 'unsubscribe',
					subscription: subscriptionId.value,
				}),
			);
			subscriptionId.value = null;
		}

		console.log(`[WebSocket] Subscribing to ${collection}...`);
		console.log('[WebSocket] Filter:', currentFilter.value);

		// Generate a unique subscription ID
		const uid = Math.random().toString(36).substring(2, 15);

		connection.value.send(
			JSON.stringify({
				type: 'subscribe',
				collection,
				query: getQuery(),
				uid, // Add a unique ID for the subscription
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
					console.log(`[WebSocket] Received unhandled message type: ${message.type}`);
			}
		} catch (err) {
			console.error('[WebSocket] Error processing message:', err);
			error.value = err;
		}
	};

	// Handle authentication response
	const handleAuthResponse = (message) => {
		if (message.status === 'ok') {
			console.log('[WebSocket] Authentication successful');
			subscribe();
		} else {
			console.error('[WebSocket] Authentication failed:', message.reason || 'Unknown reason');
			error.value = new Error(`Authentication failed: ${message.reason || 'Unknown reason'}`);
			isLoading.value = false;
		}
	};

	// Handle subscribe response
	const handleSubscribeResponse = (message) => {
		if (message.status === 'ok') {
			console.log('[WebSocket] Subscription created successfully:', message.subscription);
			subscriptionId.value = message.subscription;
		} else {
			console.error('[WebSocket] Failed to create subscription:', message.reason || 'Unknown reason');
			error.value = new Error(`Subscription failed: ${message.reason || 'Unknown reason'}`);
			isLoading.value = false;
		}
	};

	// Handle subscription data updates
	const handleSubscriptionData = (message) => {
		console.log(`[WebSocket] Received ${message.event} event for ${collection}`);

		switch (message.event) {
			case 'init':
				// Initial data load - only replace if we don't have initialData or data is empty
				if (!initialData || data.value.length === 0) {
					data.value = message.data || [];
				}
				isLoading.value = false;
				break;

			case 'create':
				// New item created
				if (message.data && message.data[0]) {
					data.value = [...data.value, message.data[0]];
				}
				break;

			case 'update':
				// Item updated
				if (message.data && message.data[0]) {
					const id = message.data[0].id;
					data.value = data.value.map((item) => (item.id === id ? message.data[0] : item));
				}
				break;

			case 'delete':
				// Item(s) deleted
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
		console.log('[WebSocket] Refreshing subscription...');
		isLoading.value = true;

		if (!connection.value || connection.value.readyState !== 1) {
			// If no connection, reconnect
			reconnectAttempts.value = 0;
			connect();
		} else {
			// If connected, just re-subscribe
			subscribe();
		}

		// Failsafe for stuck loading state
		setTimeout(() => {
			if (isLoading.value) {
				console.log('[WebSocket] Force ending loading state after timeout');
				isLoading.value = false;
			}
		}, 5000);
	};

	// Update the filter and refresh subscription
	const updateFilter = (newFilter) => {
		if (JSON.stringify(currentFilter.value) === JSON.stringify(newFilter)) {
			return; // No change in filter
		}

		console.log('[WebSocket] Updating filter:', newFilter);
		currentFilter.value = newFilter;
		isLoading.value = true;

		// If connected, resubscribe with new filter
		if (connection.value && connection.value.readyState === 1) {
			subscribe();
		} else {
			// Not connected, try to connect
			connect();
		}
	};

	// Set new data manually (useful when you fetch data from another source)
	const setData = (newData) => {
		data.value = newData;
		isLoading.value = false;
		lastUpdated.value = new Date();
	};

	// Return the public API
	return {
		data,
		isLoading,
		isConnected,
		error,
		lastUpdated,
		connect, // Component will call this in onMounted
		disconnect,
		refresh,
		updateFilter,
		setData, // New method to manually set data
		currentFilter: readonly(currentFilter),
	};
}
