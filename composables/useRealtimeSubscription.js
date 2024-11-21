import { ref, onMounted, onUnmounted } from 'vue';

export function useRealtimeSubscription(collection, fields, filter, sort) {
	const config = useRuntimeConfig();
	const data = ref([]);
	const error = ref(null);
	const isLoading = ref(true);
	const isConnected = ref(false);
	const lastUpdated = ref(null);
	const connection = ref(null);
	const reconnectAttempts = ref(0);
	const maxReconnectAttempts = 5;
	const reconnectTimeout = ref(null);

	const getQuery = () => {
		const query = {};
		if (fields) query.fields = fields;
		if (filter) query.filter = filter;
		if (sort) query.sort = sort;
		return query;
	};

	const authenticate = () => {
		if (connection.value?.readyState === WebSocket.OPEN) {
			// Use the static token from your auth setup
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
		if (connection.value?.readyState === WebSocket.OPEN) {
			const subscriptionMessage = {
				type: 'subscribe',
				collection: collection,
				query: getQuery(),
			};
			console.log('Subscribing with:', subscriptionMessage);
			connection.value.send(JSON.stringify(subscriptionMessage));
		}
	};

	const receiveMessage = (message) => {
		try {
			const messageData = JSON.parse(message.data);
			console.log('Received WebSocket message:', messageData);

			switch (messageData.type) {
				case 'auth':
					if (messageData.status === 'ok') {
						console.log('WebSocket authenticated successfully');
						subscribe();
						isConnected.value = true;
						reconnectAttempts.value = 0;
					} else {
						console.error('WebSocket authentication failed:', messageData);
						error.value = new Error('Authentication failed');
					}
					break;

				case 'subscription':
					console.log('Subscription event:', messageData.event);
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
					connection.value?.readyState === WebSocket.OPEN && connection.value.send(JSON.stringify({ type: 'pong' }));
					break;

				default:
					console.log('Unhandled message type:', messageData.type);
			}
		} catch (e) {
			console.error('Error processing message:', e);
			error.value = e;
		}
	};

	const reconnect = () => {
		if (reconnectAttempts.value >= maxReconnectAttempts) {
			console.error('Max reconnection attempts reached');
			error.value = new Error('Max reconnection attempts reached');
			return;
		}

		const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 10000);
		console.log(`Scheduling reconnect attempt ${reconnectAttempts.value + 1} in ${delay}ms`);

		reconnectTimeout.value = setTimeout(() => {
			reconnectAttempts.value++;
			connect();
		}, delay);
	};

	const connect = () => {
		disconnect();

		try {
			console.log('Connecting to WebSocket:', config.public.websocketUrl);
			connection.value = new WebSocket(config.public.websocketUrl);

			connection.value.addEventListener('open', () => {
				console.log('WebSocket connection opened');
				isConnected.value = true;
				isLoading.value = false;
				authenticate();
			});

			connection.value.addEventListener('message', receiveMessage);

			connection.value.addEventListener('close', (event) => {
				console.log('WebSocket connection closed:', event.code, event.reason);
				isConnected.value = false;
				if (!event.wasClean) {
					reconnect();
				}
			});

			connection.value.addEventListener('error', (e) => {
				console.error('WebSocket connection error:', e);
				error.value = e;
				isConnected.value = false;
				isLoading.value = false;
				reconnect();
			});
		} catch (e) {
			console.error('Failed to create WebSocket connection:', e);
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
			if (connection.value.readyState === WebSocket.OPEN) {
				connection.value.close(1000, 'Normal closure');
			}
			connection.value = null;
		}
		isConnected.value = false;
	};

	const refresh = () => {
		console.log('Refreshing WebSocket connection');
		if (!connection.value || connection.value.readyState !== WebSocket.OPEN) {
			reconnectAttempts.value = 0;
			connect();
		} else {
			subscribe();
		}
	};

	onMounted(() => {
		connect();
	});

	onUnmounted(() => {
		disconnect();
	});

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
