import { ref, onMounted, onUnmounted } from 'vue';
import { useRuntimeConfig } from '#imports';

export function useRealtimeSubscription(collection, fields = ['*'], filter = {}, sort = null, options = {}) {
	const { requireStatus = false } = options;
	const config = useRuntimeConfig();
	const data = ref([]);
	const error = ref(null);
	const isLoading = ref(true);
	const isConnected = ref(false);
	const lastUpdated = ref(null);
	let connection = null;

	const connect = () => {
		return new Promise((resolve, reject) => {
			try {
				connection = new WebSocket(config.public.websocketUrl);

				connection.addEventListener('open', () => {
					console.log('WebSocket connected');
					isConnected.value = true;
					authenticate();
					resolve(connection);
				});

				connection.addEventListener('close', () => {
					console.log('WebSocket disconnected');
					isConnected.value = false;
				});

				connection.addEventListener('error', (error) => {
					console.error('WebSocket error:', error);
					reject(error);
				});

				connection.addEventListener('message', receiveMessage);
			} catch (err) {
				reject(err);
			}
		});
	};

	const authenticate = () => {
		if (!connection) return;
		connection.send(
			JSON.stringify({
				type: 'auth',
				access_token: config.public.staticToken,
			}),
		);
	};

	const subscribe = () => {
		if (!connection) return;
		const finalFilter = requireStatus
			? {
					...filter,
					status: { _nnull: true },
				}
			: filter;

		connection.send(
			JSON.stringify({
				type: 'subscribe',
				collection: collection,
				query: {
					fields: fields,
					filter: finalFilter,
					sort: sort ? [sort] : ['-date_updated'],
				},
			}),
		);
	};

	const receiveMessage = (message) => {
		const msg = JSON.parse(message.data);
		console.log('Received message:', msg);

		switch (msg.type) {
			case 'auth':
				if (msg.status === 'ok') {
					console.log('Authentication successful');
					subscribe();
				} else {
					console.error('Authentication failed:', msg);
					error.value = 'Authentication failed';
				}
				break;

			case 'subscription':
				handleSubscriptionMessage(msg);
				break;

			case 'ping':
				connection?.send(JSON.stringify({ type: 'pong' }));
				break;

			default:
				console.log('Unhandled message type:', msg.type);
		}
	};

	const handleSubscriptionMessage = (msg) => {
		console.log('Handling subscription message:', msg);

		switch (msg.event) {
			case 'init':
				console.log('Initial data:', msg.data);
				data.value = msg.data || [];
				break;

			case 'create':
				console.log('Item created:', msg.data);
				if (msg.data?.[0]) {
					data.value = [...data.value, msg.data[0]];
				}
				break;

			case 'update':
				console.log('Item updated:', msg.data);
				if (msg.data) {
					data.value = data.value.map((item) => {
						const updated = msg.data.find((d) => d.id === item.id);
						return updated || item;
					});
				}
				break;

			case 'delete':
				console.log('Item deleted:', msg.data);
				if (msg.data) {
					data.value = data.value.filter((item) => !msg.data.includes(item.id));
				}
				break;
		}

		// Apply sorting if specified
		if (sort) {
			data.value.sort((a, b) => {
				const [field, direction] = sort.startsWith('-') ? [sort.slice(1), 'desc'] : [sort, 'asc'];

				const aVal = field.split('.').reduce((obj, key) => obj?.[key], a);
				const bVal = field.split('.').reduce((obj, key) => obj?.[key], b);
				const modifier = direction === 'desc' ? -1 : 1;
				return modifier * (new Date(aVal) - new Date(bVal));
			});
		}

		lastUpdated.value = new Date();
	};

	const refresh = async () => {
		if (connection) {
			connection.close();
		}
		isLoading.value = true;
		await connect();
		isLoading.value = false;
	};

	onMounted(async () => {
		try {
			isLoading.value = true;
			await connect();
		} catch (err) {
			error.value = err.message;
			console.error('Failed to connect:', err);
		} finally {
			isLoading.value = false;
		}
	});

	onUnmounted(() => {
		if (connection) {
			connection.close();
		}
	});

	return {
		data,
		error,
		isLoading,
		isConnected,
		lastUpdated,
		refresh,
	};
}
