import { ref, onMounted, onUnmounted } from 'vue';

export function useRealtimeSubscription(collection, fields, filter, sort) {
	const config = useRuntimeConfig();
	const nuxtApp = useNuxtApp();
	const data = ref([]);
	const error = ref(null);
	const isLoading = ref(true);
	const isConnected = ref(false);
	const lastUpdated = ref(null);
	const connection = ref(null);
	const reconnectAttempts = ref(0);
	const maxReconnectAttempts = 5;
	const reconnectTimeout = ref(null);

	// Check if we're in browser environment
	const isBrowser = typeof window !== 'undefined';

	const getQuery = () => {
		const query = {};
		if (fields) query.fields = fields;
		if (filter) query.filter = filter;
		if (sort) query.sort = sort;
		return query;
	};

	const authenticate = () => {
		if (connection.value?.readyState === 1) {
			// WebSocket.OPEN
			const token = config.public.staticToken || localStorage.getItem('auth_token');
			connection.value.send(
				JSON.stringify({
					type: 'auth',
					access_token: token,
				}),
			);
		}
	};

	const subscribe = () => {
		if (connection.value?.readyState === 1) {
			// WebSocket.OPEN
			const subscriptionMessage = {
				type: 'subscribe',
				collection: collection,
				query: getQuery(),
			};
			connection.value.send(JSON.stringify(subscriptionMessage));
		}
	};

	const receiveMessage = (message) => {
		try {
			const messageData = JSON.parse(message.data);

			switch (messageData.type) {
				case 'auth':
					if (messageData.status === 'ok') {
						subscribe();
						isConnected.value = true;
						reconnectAttempts.value = 0;
					} else {
						error.value = new Error('Authentication failed');
					}
					break;

				case 'subscription':
					if (messageData.event === 'init') {
						data.value = messageData.data;
					} else if (messageData.event === 'create') {
						data.value = [...data.value, messageData.data[0]];
					} else if (messageData.event === 'update') {
						data.value = data.value.map((item) => (item.id === messageData.data[0].id ? messageData.data[0] : item));
					} else if (messageData.event === 'delete') {
						data.value = data.value.filter((item) => !messageData.data.includes(item.id));
					}
					lastUpdated.value = new Date();
					break;

				case 'ping':
					connection.value?.send(JSON.stringify({ type: 'pong' }));
					break;
			}
		} catch (e) {
			console.error('Error processing message:', e);
			error.value = e;
		}
	};

	const reconnect = () => {
		if (reconnectAttempts.value >= maxReconnectAttempts) {
			error.value = new Error('Max reconnection attempts reached');
			return;
		}

		const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 10000);
		reconnectTimeout.value = setTimeout(() => {
			reconnectAttempts.value++;
			connect();
		}, delay);
	};

	const connect = () => {
		if (!isBrowser) return;

		disconnect();

		try {
			connection.value = new WebSocket(config.public.websocketUrl);

			connection.value.addEventListener('open', () => {
				isConnected.value = true;
				isLoading.value = false;
				authenticate();
			});

			connection.value.addEventListener('message', receiveMessage);

			connection.value.addEventListener('close', (event) => {
				isConnected.value = false;
				if (!event.wasClean) {
					reconnect();
				}
			});

			connection.value.addEventListener('error', (e) => {
				error.value = e;
				isConnected.value = false;
				isLoading.value = false;
				reconnect();
			});
		} catch (e) {
			error.value = e;
			isConnected.value = false;
			isLoading.value = false;
			reconnect();
		}
	};

	const disconnect = () => {
		if (reconnectTimeout.value) {
			clearTimeout(reconnectTimeout.value);
			reconnectTimeout.value = null;
		}

		if (connection.value) {
			if (connection.value.readyState === 1) {
				// WebSocket.OPEN
				connection.value.close(1000, 'Normal closure');
			}
			connection.value = null;
		}
		isConnected.value = false;
	};

	const refresh = () => {
		if (!isBrowser) return;

		if (!connection.value || connection.value.readyState !== 1) {
			// WebSocket.OPEN
			reconnectAttempts.value = 0;
			connect();
		} else {
			subscribe();
		}
	};

	// Only run connection logic in browser
	if (isBrowser) {
		onMounted(() => {
			connect();
		});

		onUnmounted(() => {
			disconnect();
		});
	}

	// Register plugin hooks for Nuxt app lifecycle
	if (nuxtApp) {
		nuxtApp.hook('app:mounted', () => {
			if (isBrowser) {
				connect();
			}
		});

		nuxtApp.hook('app:unmounted', () => {
			disconnect();
		});
	}

	return {
		data,
		error,
		isLoading,
		isConnected,
		lastUpdated,
		refresh,
		connect,
		disconnect,
	};
}
