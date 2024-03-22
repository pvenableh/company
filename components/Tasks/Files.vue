<script setup>
const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const adminUrl = config.public.adminUrl;

const props = defineProps({
	item: {
		type: String,
		default: '',
	},
	collection: {
		type: String,
		default: 'tasks',
	},
});

const access_token = ref(config.public.staticToken);
const url = ref(config.public.websocketUrl);

const files = ref({
	history: [],
	new: '',
});

onMounted(async () => {
	const connection = new WebSocket(url.value);
	await connection.addEventListener('open', () => authenticate(access_token.value));
	await connection.addEventListener('message', (message) => receiveMessage(message));

	function authenticate() {
		connection.send(JSON.stringify({ type: 'auth', access_token: access_token.value }));
	}

	function updateFiles(data) {
		for (const file of data) {
			const index = files.value.history.findIndex((item) => item.id == file.id);

			console.log(index);

			if (index > -1) {
				file.value.history[index] = comment;
			}
		}
	}

	function receiveMessage(message) {
		const data = JSON.parse(message.data);

		if (data.type == 'auth' && data.status == 'ok') {
			connection.send(
				JSON.stringify({
					type: 'subscribe',
					collection: 'tasks_files',
					query: {
						fields: ['directus_files_id.*'],
						filter: {
							tasks_id: {
								_eq: props.item,
							},
						},
					},
				}),
			);
		}

		if (data.type == 'subscription' && data.event == 'init') {
			for (const file of data.data) {
				files.value.history.push(file);
			}
		}

		if (data.type == 'subscription' && data.event == 'create') {
			files.value.history.push(data.data[0]);
		}

		if (data.type == 'subscription' && data.event == 'update') {
			updateFiles(data.data);
		}

		if (data.type == 'ping') {
			connection.send(JSON.stringify({ type: 'pong' }));
		}
	}
});

async function addFile(action, id) {
	if (action === 'create') {
		const result = await useDirectus(
			createItem('tasks_files', {
				directus_files_id: id,
				tasks_id: props.item,
			}),
		);
		console.log(result);
	} else if (action === 'delete') {
		const result = await useDirectus(deleteItem('tasks_files', id));

		const index = files.value.history.findIndex((file) => file.id === id);

		if (index !== -1) {
			files.value.history.splice(index, 1);
		}
		console.log(result);
	}

	updateParent();
}

async function updateParent() {
	const result = await useDirectus(updateItem('tasks', props.item, { updated_on: new Date() }));
}

function handleDelete(file) {
	console.log('handleDelete', file);
	addFile('delete', file.id);
}

function handleSuccess(file) {
	console.log(file);

	if (file.length > 0) {
		for (const f of file) {
			addFile('create', f.id);
		}
	}
}
</script>
<template>
	<div class="w-full">
		<FormVUpload
			:directus-files="true"
			:multiple="true"
			folder-id="464c11ad-93ed-42c0-9df3-3000097fc8d5"
			@success="handleSuccess"
			@delete="handleDelete"
		/>
		<div class="">
			<img
				v-for="file in files.history"
				:key="file.id"
				:src="`${adminUrl}/assets/${file.directus_files_id}`"
				:alt="file.directus_files_id.id"
				class="w-20 h-20"
			/>
		</div>
	</div>
</template>
<style></style>
