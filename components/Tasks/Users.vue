<!-- eslint-disable no-console -->
<script setup>
const config = useRuntimeConfig();
// const { user } = useDirectusAuth();

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

const { data: allUsers } = await useAsyncData('users', () => {
	return useDirectus(
		readUsers({
			fields: ['*'],
		}),
	);
});

const access_token = ref(config.public.staticToken);
const url = ref(config.public.websocketUrl);
const showUsers = ref(false);

const users = ref({
	history: [],
	new: '',
});

onMounted(async () => {
	const usersConnection = new WebSocket(url.value);
	await usersConnection.addEventListener('open', () => authenticate(access_token.value));
	await usersConnection.addEventListener('message', (message) => receiveUsersMessage(message));

	function authenticate() {
		usersConnection.send(JSON.stringify({ type: 'auth', access_token: access_token.value }));
	}

	function updateUsers(data) {
		for (const user of data) {
			const index = users.value.history.findIndex((item) => item.id == user.id);

			if (index > -1) {
				users.value.history[index] = user;
			}
		}
	}

	function receiveUsersMessage(message) {
		const data = JSON.parse(message.data);

		if (data.type == 'auth' && data.status == 'ok') {
			usersConnection.send(
				JSON.stringify({
					type: 'subscribe',
					collection: 'tasks_users',
					query: {
						fields: ['*.*'],
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
			for (const message of data.data) {
				users.value.history.push(message);
			}
		}

		if (data.type == 'subscription' && data.event == 'create') {
			users.value.history.push(data.data[0]);
		}

		if (data.type == 'subscription' && data.event == 'update') {
			updateUsers(data.data);
		}

		if (data.type == 'ping') {
			// updateUsers(data.data);
			usersConnection.send(JSON.stringify({ type: 'pong' }));
		}
	}
});

const availableUsers = computed(() => {
	return allUsers.value.filter((obj1) => !users.value.history.some((obj2) => obj1.id === obj2.directus_users_id.id));
});

async function assignUser(action, id) {
	if (action === 'create') {
		const result = await useDirectus(
			createItem('tasks_users', {
				directus_users_id: id,
				tasks_id: props.item,
			}),
		);
	} else if (action === 'delete') {
		const result = await useDirectus(deleteItem('tasks_users', id));

		const index = users.value.history.findIndex((user) => user.id === id);

		if (index !== -1) {
			users.value.history.splice(index, 1);
		}
	}

	updateParent();
}

async function updateParent() {
	const result = await useDirectus(updateItem('tasks', props.item, { updated_on: new Date() }));
}
</script>
<template>
	<div class="flex items-start justify-between flex-col task-card__people">
		<!-- <h3 class="uppercase mt-6 mb-2 tracking-wide font-bold text-[8px] border-b w-full">Assigned Users:</h3> -->
		<div v-if="users.history.length" class="flex flex-row flex-wrap items-end justify-end w-full">
			<UTooltip
				v-for="(user, index) in users.history"
				:key="index"
				:text="user.directus_users_id.first_name + ' ' + user.directus_users_id.last_name"
				class="mr-1 task-card__people-item cursor-pointer"
				@click="assignUser('delete', user.id)"
			>
				<Avatar :key="index" :user="user.directus_users_id" size="xs" class="border task-card__people-avatar" />
			</UTooltip>
		</div>
		<div class="w-full flex items-start justify-between flex-row">
			<div
				v-if="availableUsers.length"
				class="w-full flex items-center justify-between flex-row uppercase text-xs font-bold tracking-wide text-[8px]"
				style="font-size: 8px"
			>
				<div class="flex flex-row items-center justify-center">
					<UToggle
						v-model="showUsers"
						color="gray"
						on-icon="i-heroicons-users-solid"
						off-icon="i-heroicons-x-mark-20-solid"
					/>
					<p class="ml-2">
						{{ showUsers ? 'Hide ' + availableUsers.length + ' Users' : 'Show ' + availableUsers.length + ' Users' }}
					</p>
				</div>
			</div>
		</div>
		<div class="w-full task-card__people-selection" :class="{ visible: showUsers }">
			<div class="w-full flex flex-row flex-wrap py-2">
				<div
					v-for="(user, index) in availableUsers"
					:key="index"
					class="flex items-center justify-start flex-row mr-2 mb-2 cursor-pointer"
					@click="assignUser('create', user.id)"
				>
					<!-- <Avatar :user="user" size="sm" class="" /> -->
					<UBadge color="gray" variant="solid" class="text-[10px] font-bold">
						{{ user.first_name }} {{ user.last_name }}
					</UBadge>
				</div>
			</div>
		</div>
	</div>
</template>
<style>
.task-card__people {
	@apply uppercase my-2;

	&-item {
	}

	&-avatar {
		@apply ring-2 ring-white dark:ring-gray-900;
	}
	&-selection {
		transition: max-height 0.35s ease-in-out;
		overflow: hidden;
		max-height: 0;
	}
	&-selection.visible {
		max-height: 300px;
	}
}
</style>
