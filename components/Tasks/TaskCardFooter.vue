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
	commentsTotal: {
		type: Number,
		default: 0,
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

const showComments = ref(false);
const showUsers = ref(false);
const showFiles = ref(false);

function toggleUsers() {
	showComments.value = false;
	showFiles.value = false;
	showUsers.value = !showUsers.value;
}

function toggleComments() {
	showUsers.value = false;
	showFiles.value = false;
	showComments.value = !showComments.value;
}

function toggleFiles() {
	showUsers.value = false;
	showComments.value = false;
	showFiles.value = !showFiles.value;
}
</script>
<template>
	<div class="w-full flex items-start justify-between flex-col relative task-card__footer">
		<div v-if="users.history.length" class="mb-2 flex flex-row flex-wrap items-center justify-start w-full px-4 my-3">
			<h3 class="uppercase leading-4 mb-2 tracking-wide font-bold border-b text-[8px] w-full">Assigned Users:</h3>
			<UTooltip
				v-for="(user, index) in users.history"
				:key="index"
				:text="user.directus_users_id.first_name + ' ' + user.directus_users_id.last_name"
				class="transition duration-200 mr-1 task-card__people-item cursor-pointer"
				@click="assignUser('delete', user.id)"
			>
				<Avatar :key="index" :user="user.directus_users_id" size="xs" class="border task-card__people-avatar" />
			</UTooltip>
		</div>
		<div class="w-full flex items-start justify-between flex-row task-card__footer-toolbar">
			<div class="task-card__footer-button" @click="toggleUsers">
				<h5>
					Users
					<span class="chip">{{ availableUsers.length }}</span>
				</h5>
			</div>
			<div class="task-card__footer-button" @click="toggleComments">
				<h5>
					Comments
					<span class="chip">{{ commentsTotal }}</span>
				</h5>
			</div>
			<div class="task-card__footer-button" @click="toggleFiles">
				<h5>
					Files
					<span class="chip">2</span>
				</h5>
			</div>
		</div>
		<div class="w-full task-card__comments" :class="{ visible: showComments }">
			<TasksComments :item="item" collection="tasks" />
		</div>
		<div class="w-full task-card__people-selection" :class="{ visible: showUsers }">
			<div v-if="availableUsers.length" class="w-full flex flex-row flex-wrap p-4">
				<div
					v-for="(user, index) in availableUsers"
					:key="index"
					class="flex items-center justify-start flex-row mr-2 mb-2 cursor-pointer"
					@click="assignUser('create', user.id)"
				>
					<!-- <Avatar :user="user" size="sm" class="" /> -->
					<UBadge color="gray" variant="solid" class="text-[10px] font-bold shadow-inner">
						{{ user.first_name }} {{ user.last_name }}
					</UBadge>
				</div>
			</div>
			<div v-else class="w-full flex flex-row flex-wrap p-4">
				<h5 class="uppercase text-[12px] tracking-wide">No available users.</h5>
			</div>
		</div>
		<div class="task-card__files" :class="{ visible: showFiles }">
			<TasksFiles :item="item" collection="tasks" />
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
.task-card__comments {
	transition: max-height 0.35s ease-in-out;
	overflow: hidden;
	max-height: 0;
	&.visible {
		max-height: 800px;
	}
}
.task-card__files {
	transition: max-height 0.35s ease-in-out;
	overflow: hidden;
	max-height: 0;

	&.visible {
		max-height: 300px;
	}
}
.task-card__footer {
	&-toolbar {
		background: #f6f6f6;
		@apply shadow-sm dark:bg-gray-800;
	}
	&-button {
		cursor: pointer;
		transition: all 0.35s ease-in-out;
		@apply uppercase text-[10px] text-center w-1/3 py-3 border-b border-t dark:border-gray-700;
		h5 {
			@apply relative inline-block;
		}
		.chip {
			@apply bg-sky-500 text-white rounded-full px-[.3rem] py-0.5 text-[8px] scale-90;
		}
	}
	&-button:nth-of-type(2) {
		@apply border-l border-r;
	}
}
</style>
