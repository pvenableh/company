import { ref, watch, onUnmounted, computed } from 'vue';
import { useRuntimeConfig } from '#app';
import { useDebounceFn } from '@vueuse/core';

export function useRealtimeSubscription(collection, fields = ['*'], filter, sort) {
	const MINIMUM_LOADING_DURATION = 500;
	let loadingStartTime;

	const setLoading = (value) => {
		if (value) {
			loadingStartTime = Date.now();
			isLoading.value = true;
		} else {
			const elapsed = Date.now() - loadingStartTime;
			const remaining = Math.max(0, MINIMUM_LOADING_DURATION - elapsed);
			setTimeout(() => {
				isLoading.value = false;
			}, remaining);
		}
	};

	const config = useRuntimeConfig();
	const connection = ref(null);
	const isConnected = ref(false);
	const isLoading = ref(false);
	const error = ref(null);
	const data = ref([]);
	const lastUpdated = ref(null);
	const reconnectAttempts = ref(0);
	const maxReconnectAttempts = 5;
	const reconnectTimeout = ref(null);

	// Convert filter to a computed ref if it's not already reactive
	const filterRef = computed(() => {
		return typeof filter === 'function' ? filter() : filter;
	});

	const debouncedSubscribe = useDebounceFn(() => {
		if (connection.value?.readyState === WebSocket.OPEN) {
			const subscriptionMessage = {
				type: 'subscribe',
				collection: collection,
				query: {
					fields: fields,
					filter: filterRef.value,
					sort: sort ? [sort] : undefined,
				},
			};
			connection.value.send(JSON.stringify(subscriptionMessage));
		}
	}, 300);

	const authenticate = () => {
		if (connection.value?.readyState === WebSocket.OPEN) {
			const token = config.public.staticToken;
			connection.value.send(
				JSON.stringify({
					type: 'auth',
					access_token: token,
				}),
			);
		}
	};

	const handleMessage = (message) => {
		try {
			const messageData = JSON.parse(message.data);

			switch (messageData.type) {
				case 'auth':
					if (messageData.status === 'ok') {
						debouncedSubscribe();
						isConnected.value = true;
						setLoading(false);
						reconnectAttempts.value = 0;
					} else {
						error.value = new Error('Authentication failed');
						debouncedReconnect();
					}
					break;

				case 'subscription':
					switch (messageData.event) {
						case 'init':
							data.value = messageData.data;
							break;
						case 'create':
							data.value = [...data.value, messageData.data[0]];
							break;
						case 'update':
							data.value = data.value.map((item) => (item.id === messageData.data[0].id ? messageData.data[0] : item));
							break;
						case 'delete':
							data.value = data.value.filter((item) => !messageData.data.includes(item.id));
							break;
					}
					lastUpdated.value = new Date();
					break;

				case 'ping':
					connection.value?.send(JSON.stringify({ type: 'pong' }));
					break;
			}
		} catch (e) {
			error.value = e;
			debouncedReconnect();
		}
	};

	const debouncedReconnect = useDebounceFn(() => {
		if (reconnectAttempts.value >= maxReconnectAttempts) {
			error.value = new Error('Max reconnection attempts reached');
			return;
		}

		if (reconnectTimeout.value) {
			clearTimeout(reconnectTimeout.value);
		}

		reconnectAttempts.value++;
		const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000);

		reconnectTimeout.value = setTimeout(() => {
			connect();
		}, delay);
	}, 1000);

	const connect = () => {
		if (connection.value?.readyState === WebSocket.OPEN) {
			connection.value.close();
		}

		setLoading(true);

		try {
			connection.value = new WebSocket(config.public.websocketUrl);

			connection.value.addEventListener('open', () => {
				isConnected.value = true;
				authenticate();
			});

			connection.value.addEventListener('message', handleMessage);

			connection.value.addEventListener('close', () => {
				isConnected.value = false;
				debouncedReconnect();
			});

			connection.value.addEventListener('error', (e) => {
				error.value = e;
				isConnected.value = false;
				debouncedReconnect();
			});
		} catch (e) {
			error.value = e;
			isConnected.value = false;
			setLoading(false);
			debouncedReconnect();
		}
	};

	const disconnect = () => {
		if (reconnectTimeout.value) {
			clearTimeout(reconnectTimeout.value);
			reconnectTimeout.value = null;
		}

		if (connection.value) {
			connection.value.close();
			connection.value = null;
		}

		setLoading(false);
		reconnectAttempts.value = 0;
	};

	const refresh = useDebounceFn(() => {
		disconnect();
		connect();
	}, 500);

	// Watch the computed filterRef
	watch(
		filterRef,
		() => {
			if (isConnected.value) {
				debouncedSubscribe();
			}
		},
		{ deep: true },
	);

	onUnmounted(() => {
		disconnect();
	});

	connect();

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
