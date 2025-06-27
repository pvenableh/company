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
	const { status } = useAuth();

	// ===== Enhanced Authentication Checking =====

	// Check if we have valid auth before attempting connection
	const hasValidAuth = () => {
		// Must be authenticated according to auth status
		if (status.value !== 'authenticated') {
			console.log('[WebSocket] Not authenticated, skipping connection');
			return false;
		}

		// Check for available tokens
		let hasToken = false;

		if (import.meta.client) {
			const { data: authData } = useAuth();

			// Check for session error
			if (authData.value?.error) {
				console.log('[WebSocket] Auth session has error, skipping connection');
				return false;
			}

			// Check for valid tokens
			const sessionToken = authData.value?.directusToken;
			const localToken =
				localStorage.getItem('auth_token') ?? localStorage.getItem('directus_session_token') ?? undefined;
			const staticToken = config.public.staticToken;

			hasToken = !!(sessionToken || localToken || staticToken);
		}

		if (!hasToken) {
			console.log('[WebSocket] No authentication tokens available');
			return false;
		}

		return true;
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
			console.log('[WebSocket] Skipping connection due to invalid auth state');
			isLoading.value = false;
			return;
		}

		// Prevent multiple connections
		if (connection.value && connection.value.readyState < 2) {
			console.log('[WebSocket] Connection already exists');
			return;
		}

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

				// Only attempt reconnect if we still have valid auth
				if (!event.wasClean && hasValidAuth()) {
					scheduleTryReconnect();
				} else {
					console.log('[WebSocket] Not reconnecting due to invalid auth or clean close');
					isLoading.value = false;
				}
			});

			connection.value.addEventListener('error', (event) => {
				console.error('[WebSocket] Connection error:', event);
				error.value = new Error('WebSocket connection error');
				isConnected.value = false;

				// Only attempt reconnect if we have valid auth
				if (hasValidAuth()) {
					scheduleTryReconnect();
				} else {
					console.log('[WebSocket] Not reconnecting due to invalid auth');
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
		console.log('[WebSocket] Disconnecting...');

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

		// Don't reconnect if auth is invalid
		if (!hasValidAuth()) {
			console.log('[WebSocket] Skipping reconnect due to invalid auth');
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

	// Enhanced authenticate function
	const authenticate = () => {
		if (!connection.value || connection.value.readyState !== 1) {
			console.log('[WebSocket] Cannot authenticate - connection not ready');
			return;
		}

		if (!hasValidAuth()) {
			console.log('[WebSocket] Cannot authenticate - invalid auth state');
			error.value = new Error('Authentication failed - invalid auth state');
			isLoading.value = false;
			return;
		}

		let token = null;

		if (import.meta.client) {
			const { data: authData } = useAuth();

			// Check for session error
			if (authData.value?.error) {
				console.error('[WebSocket] Auth error detected, cannot authenticate');
				error.value = new Error('Authentication failed - session error');
				isLoading.value = false;
				return;
			}

			// Try to get token from multiple sources
			token =
				(authData.value?.directusToken || localStorage.getItem('auth_token')) ??
				localStorage.getItem('directus_session_token') ??
				config.public.staticToken;

			if (token && token.length < 20) {
				console.log('[WebSocket] Token seems too short, using static token');
				token = config.public.staticToken;
			}
		} else {
			token = config.public.staticToken;
		}

		if (!token) {
			console.error('[WebSocket] No authentication token available');
			error.value = new Error('No authentication token available');
			isLoading.value = false;
			return;
		}

		console.log('[WebSocket] Authenticating with token...');

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
			console.log('[WebSocket] Cannot subscribe - connection not ready');
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

		// Generate a unique subscription ID
		const uid = Math.random().toString(36).substring(2, 15);

		console.log('[WebSocket] Subscribing to collection:', collection);

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

			// If auth failed due to invalid token, don't retry
			if (message.reason?.includes('invalid') || message.reason?.includes('expired')) {
				console.log('[WebSocket] Token invalid, not retrying');
				disconnect();
			}
		}
	};

	// Handle subscribe response
	const handleSubscribeResponse = (message) => {
		if (message.status === 'ok') {
			console.log('[WebSocket] Subscription successful');
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
				// Initial data load
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
		console.log('[WebSocket] Refreshing subscription...');

		// Check auth before refreshing
		if (!hasValidAuth()) {
			console.log('[WebSocket] Cannot refresh - invalid auth state');
			isLoading.value = false;
			return;
		}

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
				console.log('[WebSocket] Refresh timeout, ending loading state');
				isLoading.value = false;
			}
		}, 8000);
	};

	// Update the filter and refresh subscription
	const updateFilter = (newFilter) => {
		if (JSON.stringify(currentFilter.value) === JSON.stringify(newFilter)) {
			return; // No change in filter
		}

		console.log('[WebSocket] Updating filter');
		currentFilter.value = newFilter;

		// Check auth before updating
		if (!hasValidAuth()) {
			console.log('[WebSocket] Cannot update filter - invalid auth state');
			isLoading.value = false;
			return;
		}

		isLoading.value = true;

		// If connected, resubscribe with new filter
		if (connection.value && connection.value.readyState === 1) {
			subscribe();
		} else {
			// Not connected, try to connect
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
		() => status.value,
		(newStatus, oldStatus) => {
			console.log(`[WebSocket] Auth status changed: ${oldStatus} -> ${newStatus}`);

			if (newStatus === 'unauthenticated') {
				// User logged out, disconnect immediately
				disconnect();
				data.value = [];
				isLoading.value = false;
			} else if (newStatus === 'authenticated' && oldStatus === 'unauthenticated') {
				// User logged in, connect if we have a subscription
				if (collection) {
					setTimeout(() => {
						if (hasValidAuth()) {
							connect();
						}
					}, 1000); // Small delay to ensure auth state is stable
				}
			}
		},
	);

	// Set up periodic auth check
	if (import.meta.client) {
		authCheckTimer.value = setInterval(() => {
			if (isConnected.value && !hasValidAuth()) {
				console.log('[WebSocket] Periodic auth check failed, disconnecting');
				disconnect();
			}
		}, 30000); // Check every 30 seconds
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
