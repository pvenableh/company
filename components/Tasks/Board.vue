<script setup>
import draggable from 'vuedraggable';

const config = useRuntimeConfig();

const access_token = ref(config.public.staticToken);
const url = ref(config.public.websocketUrl);
const { user } = useDirectusAuth();

// const tasks = ref({
// 	history: [],
// 	new: '',
// });

const tasks = ref([]);

onMounted(async () => {
	const connection = new WebSocket(url.value);
	connection.addEventListener('open', () => authenticate(access_token.value));
	connection.addEventListener('message', (message) => receiveMessage(message));

	function authenticate() {
		connection.send(JSON.stringify({ type: 'auth', access_token: access_token.value }));
	}

	function updateTasks(data) {
		for (const task of data) {
			const index = tasks.value.findIndex((item) => item.id == task.id);

			if (index > -1) {
				tasks.value[index] = task;
			}
		}
	}

	function receiveMessage(message) {
		const data = JSON.parse(message.data);

		if (data.type == 'auth' && data.status == 'ok') {
			connection.send(
				JSON.stringify({
					type: 'subscribe',
					collection: 'tasks',
					query: {
						fields: [
							'*,user_created.id,user_created.first_name,user_created.last_name,user_updated.id,user_updated.first_name,user_updated.last_name,files.*',
						],

						sort: 'date_created',
					},
				}),
			);
		}

		if (data.type == 'subscription' && data.event == 'init') {
			for (const message of data.data) {
				tasks.value.push(message);
			}
		}

		if (data.type == 'subscription' && data.event == 'create') {
			tasks.value.push(data.data[0]);
		}

		if (data.type == 'subscription' && data.event == 'update') {
			updateTasks(data.data);
		}

		if (data.type == 'ping') {
			connection.send(JSON.stringify({ type: 'pong' }));
		}
	}
});

const dragging = ref(false);

const enabled = computed(() => {
	return user.value ? true : false;
});

const draggingInfo = computed(() => {
	return dragging.value ? 'under drag' : '';
});

function updateTasks(category, event) {
	if (event.added) {
		const movedTask = tasks.value.find((task) => task.id === event.added.element.id);

		if (movedTask) {
			movedTask.category = category;
		}

		sendUpdate(movedTask);
	}

	if (event.moved) {
		const movedTask = tasks.value.find((task) => task.id === event.moved.element.id);

		if (movedTask) {
			movedTask.category = category;
		}
	}
}

async function sendUpdate(item) {
	const result = await useDirectus(updateItem('tasks', item.id, item));
}

const groupedData = computed(() => {
	const requiredCategories = ['Pending', 'Scheduled', 'In Progress', 'Completed'];

	const categories = requiredCategories.reduce((acc, category) => {
		acc[category] = [];
		return acc;
	}, {});

	tasks.value.forEach((item) => {
		if (!categories[item.category]) {
			categories[item.category] = [];
		}

		console.log(user.value);
		console.log('looking for user role');

		if (user.value && user.value.role === '7913bfde-8ec9-4c51-8ecf-7efdb160a36d') {
			categories[item.category].push(item);
		} else {
			if (item.assigned_to.length > 0) {
				item.assigned_to.forEach((person) => {
					if (person.directus_users_id.id === user.value.id) {
						categories[item.category].push(item);
					}
				});
			} else {
				console.log('no assigned user.');
			}
		}
	});

	return categories;
});

const currentPanel = ref(0);

function changePanel(index, duration = 400) {
	const element = document.getElementById('tasks-board__container');
	const distance = (index - currentPanel.value) * 350;
	const start = element.scrollLeft;
	const startTime = performance.now();

	function scroll(timestamp) {
		const elapsed = timestamp - startTime;
		const progress = Math.min(elapsed / duration, 1);
		element.scrollLeft = start + distance * progress;

		if (progress < 1) {
			requestAnimationFrame(scroll);
		}
	}

	requestAnimationFrame(scroll);
	currentPanel.value = index;
}
</script>
<template>
	<div class="flex flex-row flex-wrap w-full items-center justify-center tasks-board">
		<h1 class="hidden">{{ draggingInfo }}</h1>

		<div class="w-full lg:hidden flex flex-row items-center justify-center tasks-board__nav">
			<div
				v-for="(items, category, index) in groupedData"
				:key="index"
				class="w-1/4 border text-center py-3"
				@click="changePanel(index)"
			>
				<h5 class="uppercase tracking-wide text-[10px] font-bold">
					{{ category }}
					<UBadge
						v-if="items.length"
						size="xs"
						color="gray"
						:ui="{ rounded: 'rounded-full' }"
						class="absolute top-[-10px] scale-90"
					>
						{{ items.length }}
					</UBadge>
				</h5>
			</div>
		</div>
		<div
			id="tasks-board__container"
			class="w-full flex flex-row flex-nowrap items-center justify-center tasks-board__container"
		>
			<div class="tasks-board__container-inner">
				<div
					v-for="(items, category) in groupedData"
					:key="category"
					class="tasks-board__col flex-1"
					:id="slugify(category)"
				>
					<h2 class="w-full relative uppercase tracking-wide font-bold text-sm hidden lg:block">
						{{ category }}
						<UBadge
							v-if="items.length"
							size="xs"
							color="gray"
							:ui="{ rounded: 'rounded-full' }"
							class="absolute top-[-10px] scale-90"
						>
							{{ items.length }}
						</UBadge>
					</h2>
					<draggable
						:disabled="!enabled"
						:list="items"
						tag="div"
						group="tasks"
						class="tasks-board__col-inner"
						ghost-class="ghost"
						@change="updateTasks(category, $event)"
						@start="dragging = true"
						@end="dragging = false"
					>
						<template #item="{ element: task }">
							<TasksTaskCard v-if="items.length > 0" :id="'task-' + task.id" :key="task.id" :task="task" />
							<h5 v-else>No {{ category }} tasks.</h5>
						</template>
					</draggable>
				</div>
			</div>
		</div>
	</div>
</template>
<style>
.tasks-board {
	&__container {
		white-space: nowrap;
		@apply w-full flex flex-row flex-nowrap items-start justify-start overflow-x-scroll lg:overflow-visible;
		&-inner {
			width: 400%;
			@apply lg:w-full flex flex-row flex-nowrap items-start justify-start lg:justify-center lg:items-start;
		}
	}
	&__col {
		width: 350px;
		@apply lg:w-full lg:max-w-[375px] lg:min-h-screen flex flex-col items-center justify-start;
	}

	&__col-inner {
		max-width: 375px;
		/* border: thin solid rgba(0, 0, 0, 0.05); */
		@apply border border-gray-900/5 dark:border-gray-900/50 w-full flex flex-col items-center justify-start px-4 py-4 min-h-screen;
	}
}
</style>
