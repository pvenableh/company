import { ref, onMounted, onUnmounted } from 'vue';
import { useRuntimeConfig } from '#imports';
import { createDirectus, rest, realtime, readItems } from '@directus/sdk';

export function useRealtimeSubscription(collection, fields = ['*'], filter = {}, sort = null) {
	const config = useRuntimeConfig();
	const data = ref([]);
	const error = ref(null);
	const isLoading = ref(true);
	const isConnected = ref(false);
	const lastUpdated = ref(null);
	const retryAttempts = ref(0);
	const maxRetryAttempts = 5;
	let unsubscribe = null;
	let retryTimeout = null;

	// Create Directus client with both REST and realtime
	const client = createDirectus(config.public.directusUrl)
		.with(rest())
		.with(
			realtime({
				authMode: 'public',
				token: config.public.staticToken,
			}),
		);

	const subscribe = async () => {
		try {
			isLoading.value = true;
			error.value = null;

			// First, get initial data using REST
			const initialData = await client.request(
				readItems(collection, {
					fields,
					filter,
					sort: sort ? [sort] : undefined,
				}),
			);

			data.value = initialData;
			lastUpdated.value = new Date();

			// Then set up realtime subscription
			const { subscription, unsubscribe: unsubscribeFunc } = await client.subscribe(collection, {
				fields,
				filter,
				sort: sort ? [sort] : undefined,
			});

			unsubscribe = unsubscribeFunc;
			isConnected.value = true;
			retryAttempts.value = 0; // Reset retry attempts on successful connection

			// Handle subscription messages
			(async () => {
				try {
					for await (const message of subscription) {
						if (!message) continue;

						// Check if message is an array (initial data)
						if (Array.isArray(message)) {
							data.value = message;
							lastUpdated.value = new Date();
							continue;
						}

						// Handle subscription events
						switch (message.event) {
							case 'create':
								data.value = [...data.value, message.data];
								break;

							case 'update':
								data.value = data.value.map((item) => (item.id === message.data.id ? message.data : item));
								break;

							case 'delete':
								data.value = data.value.filter((item) => item.id !== message.data);
								break;
						}

						// Apply sorting if specified
						if (sort) {
							const [field, direction] = sort.startsWith('-') ? [sort.slice(1), 'desc'] : [sort, 'asc'];

							data.value.sort((a, b) => {
								const aVal = field.split('.').reduce((obj, key) => obj?.[key], a);
								const bVal = field.split('.').reduce((obj, key) => obj?.[key], b);
								const modifier = direction === 'desc' ? -1 : 1;
								return modifier * (new Date(aVal) - new Date(bVal));
							});
						}

						lastUpdated.value = new Date();
					}
				} catch (err) {
					console.error('Subscription stream error:', err);
					error.value = err.message;
					isConnected.value = false;

					// Implement exponential backoff for retries
					if (retryAttempts.value < maxRetryAttempts) {
						const delay = Math.min(1000 * Math.pow(2, retryAttempts.value), 30000);
						retryTimeout = setTimeout(() => {
							retryAttempts.value++;
							subscribe();
						}, delay);
					} else {
						error.value = 'Maximum retry attempts reached. Please refresh the page.';
					}
				}
			})();
		} catch (err) {
			console.error('Error in subscription setup:', err);
			error.value = err.message;
			isConnected.value = false;
		} finally {
			isLoading.value = false;
		}
	};

	// Clean up function
	const cleanup = () => {
		if (unsubscribe) {
			unsubscribe();
		}
		if (retryTimeout) {
			clearTimeout(retryTimeout);
		}
		isConnected.value = false;
	};

	onMounted(() => {
		subscribe();
	});

	onUnmounted(() => {
		cleanup();
	});

	return {
		data,
		error,
		isLoading,
		isConnected,
		lastUpdated,
		refresh: async () => {
			cleanup();
			retryAttempts.value = 0;
			await subscribe();
		},
	};
}
