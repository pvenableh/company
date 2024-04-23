<!-- eslint-disable no-console -->
<script setup>
const user = useDirectusAuth();
import { createDirectus, staticToken, realtime } from '@directus/sdk';

const config = useRuntimeConfig();

const access_token = ref(config.public.staticToken);
const url = ref(config.public.websocketUrl);
const collection = 'tickets';

const tickets = ref([]);
const ticket = ref({});
const client = createDirectus(url.value).with(staticToken(access_token.value)).with(realtime());

onMounted(async () => {
	await client.connect();

	client.onWebSocket('open', function () {
		console.log({ event: 'onopen' });
	});

	client.onWebSocket('message', function (message) {
		const { type, data } = message;

		if (message.type == 'auth' && message.status == 'ok') {
			subscribe();
			console.log({ event: 'onmessage', data });
		}
	});

	client.onWebSocket('close', function () {
		console.log({ event: 'onclose' });
	});

	client.onWebSocket('error', function (error) {
		console.log({ event: 'onerror', error });
	});

	const { subscription } = await client.subscribe(collection, {
		event: 'update',
		query: { fields: ['*'] },
	});

	for await (const item of subscription) {
		console.log(item);
	}
});

function createItem() {
	ticket.value = {
		status: 'published',
		category: 'Pending',
		user_created: user.id,
		title: 'New One: ' + Math.random(),
		description: 'From localhost.',
	};

	client.sendMessage({
		type: 'items',
		collection: collection,
		action: 'create',
		data: ticket.value,
	});
}
</script>
<template>
	<div class="min-h-screen">
		<Ubutton @click="createItem()">Create Ticket</Ubutton>
		<div class="w-full">{{ tickets }}</div>
	</div>
</template>

<style></style>
