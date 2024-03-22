<script setup>
import { createDirectus, staticToken, realtime } from '@directus/sdk';

const config = useRuntimeConfig();

const url = config.public.websocketUrl;
const access_token = config.public.staticToken;
const collection = 'services';

const client = createDirectus(url).with(staticToken(access_token)).with(realtime());

onMounted(async () => {
	await client.connect();
	// Subscribe to changes

	client.onWebSocket('open', function () {
		console.log({ event: 'onopen' });
		console.log('WebSocket connection opened');

		// Subscribe to events for the 'services' collection
		client.subscribe('items.services.create', function (data) {
			console.log('Service created:', data);
		});

		client.subscribe('items.services.update', function (data) {
			console.log('Service updated:', data);
		});

		client.subscribe('items.services.delete', function (data) {
			console.log('Service deleted:', data);
		});
	});

	client.onWebSocket('message', function (message) {
		const { type, data } = message;
		console.log({ event: 'onmessage', data });
	});

	client.onWebSocket('close', function () {
		console.log({ event: 'onclose' });
	});

	client.onWebSocket('error', function (error) {
		console.log({ event: 'onerror', error });
	});
});
</script>
<template>
	<div class="min-h-screen">
		<div class="w-full"></div>
	</div>
</template>

<style></style>
