import { ref, onMounted, onUnmounted } from 'vue';
import { useRuntimeConfig } from '#imports';

export function useRealtimeSubscription(collection, fields, filter, sort) {
	const config = useRuntimeConfig();
	const access_token = ref(config.public.staticToken);
	const url = ref(config.public.websocketUrl);

	const data = ref([]);
	const query = {};

	if (fields) {
		query.fields = fields;
	}

	if (filter) {
		query.filter = filter;
	}

	if (sort) {
		query.sort = sort;
	}

	if (!collection) {
		throw new Error('Collection is required');
	}

	let connection = null;

	const authenticate = () => {
		console.log('authenticating');
		connection.send(JSON.stringify({ type: 'auth', access_token: access_token.value }));
	};

	const updateData = (items) => {
		console.log('updating data');
		for (const item of items) {
			const index = data.value.findIndex((existingItem) => existingItem.id == item.id);
			console.log(index);
			if (index > -1) {
				data.value[index] = item;
			} else {
				data.value.push(item);
			}
		}
	};
	
	const deleteData = (items) => {
		for (const item of items) {
			const index = data.value.findIndex((existingItem) => {
				return existingItem.id === item;
			});

			if (index > -1) {
				data.value.splice(index, 1);
			} else {
				console.log('item not found');
			}
		}
	};

	const receiveMessage = (message) => {
		const messageData = JSON.parse(message.data);
		console.log(messageData.event);
		switch (messageData.type) {
			case 'auth':
				if (messageData.status == 'ok') {
					connection.send(
						JSON.stringify({
							type: 'subscribe',
							collection: collection,
							query: query,
						}),
					);
				}
				break;
			case 'subscription':
				if (messageData.event === 'init') {
					data.value.push(...messageData.data);
				}
				if (messageData.event === 'create') {
					data.value.push(messageData.data[0]);
					data.value.sort((a, b) => {
						return new Date(b.date_created) - new Date(a.date_created);
					});
				}
				if (messageData.event === 'update') {
					updateData(messageData.data);
					data.value.sort((a, b) => {
						return new Date(b.date_created) - new Date(a.date_created);
					});
				}
				if (messageData.event === 'delete') {
					deleteData(messageData.data);
					data.value.sort((a, b) => {
						return new Date(b.date_created) - new Date(a.date_created);
					});
				}
				break;
			case 'ping':
				connection.send(JSON.stringify({ type: 'pong' }));
				break;
		}
	};

	onMounted(() => {
		connection = new WebSocket(url.value);
		connection.addEventListener('open', authenticate);
		connection.addEventListener('message', receiveMessage);
	});

	onUnmounted(() => {
		if (connection) {
			connection.close();
		}
	});

	return { data };
}
