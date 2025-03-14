<script setup>
import draggable from 'vuedraggable';
import confetti from 'canvas-confetti';

const router = useRouter();

const { user: currentUser } = useDirectusAuth();
const { createItem, updateItem, deleteItem } = useDirectusItems();
const { notify } = useNotifications();
const toast = useToast();
const mentionedUsers = ref(new Set());
const newTask = ref('');

const props = defineProps({
	ticketId: {
		type: String,
		required: true,
	},
});

const localTasks = ref();
const isInitialized = ref(false);
const isLoading = ref(true); // Added loading state
const isConnected = ref(true); // Added connection state
const error = ref(null); // Added error state

const {
	data: remoteTasks,
	isLoading: wsLoading,
	isConnected: wsConnected,
	error: wsError,
	refresh,
	connect,
	disconnect,
} = useRealtimeSubscription(
	'tasks',
	[
		'id',
		'description',
		'status',
		'sort',
		'date_created',
		'date_updated',
		'user_created.first_name',
		'user_created.last_name',
		'user_created.id',
		'user_updated.first_name',
		'user_updated.last_name',
		'user_updated.id',
		'assigned_to.id',
		'assigned_to.directus_users_id.id',
		'assigned_to.directus_users_id.first_name',
		'assigned_to.directus_users_id.last_name',
		'assigned_to.directus_users_id.email',
		'assigned_to.directus_users_id.avatar',
	],
	{
		ticket_id: {
			_eq: props.ticketId,
		},
	},
	'sort',
);

// Update loading and connection state
watch(wsLoading, (val) => (isLoading.value = val));
watch(wsConnected, (val) => (isConnected.value = val));
watch(wsError, (val) => (error.value = val));

// Modified watch to handle updates after initialization
watch(
	remoteTasks,
	(newTasks) => {
		if (!newTasks) {
			localTasks.value = [];
			return;
		}
		if (!isInitialized.value) {
			localTasks.value = [...newTasks].sort((a, b) => a.sort - b.sort);
			isInitialized.value = true;
		} else {
			// Update localTasks when remoteTasks changes, preserving the current order
			const currentOrder = localTasks.value.map((task) => task.id);
			const updatedTasks = [...newTasks];

			// Sort based on current order if task exists, put new tasks at the end
			updatedTasks.sort((a, b) => {
				const aIndex = currentOrder.indexOf(a.id);
				const bIndex = currentOrder.indexOf(b.id);
				if (aIndex === -1) return 1; // New task goes to end
				if (bIndex === -1) return -1; // New task goes to end
				return aIndex - bIndex;
			});

			localTasks.value = updatedTasks;
		}
	},
	{ deep: true, immediate: true },
);

const handleMention = (mentionData) => {
	mentionedUsers.value.add(mentionData.id);
};

async function notifyMentionedUsers(commentText, collection, itemId) {
	for (const userId of mentionedUsers.value) {
		await notify({
			recipient: userId,
			subject: 'You were mentioned in a task',
			message: `${currentUser.value.first_name} ${currentUser.value.last_name} mentioned you in a task: ${commentText}`,
			collection,
			item: itemId,
			sender: currentUser.value.id,
		});

		console.log(currentUser.value.id);
	}
}

async function addTask() {
	if (!newTask.value.trim()) return;

	try {
		const newTaskId = await createItem('tasks', {
			description: newTask.value,
			ticket_id: props.ticketId,
			status: 'active',
			sort: localTasks.value.length,
		});

		console.log(newTaskId);

		if (mentionedUsers.value.size > 0) {
			await notifyMentionedUsers(newTask.value, 'tasks', newTaskId.id);
		}

		newTask.value = '';
	} catch (error) {
		console.error('Error adding task:', error);
		toast.add({
			title: 'Error Adding Task',
			description: 'Failed to add the task. Please try again.',
			color: 'red',
		});
	}
}

function randomInRange(min, max) {
	return Math.random() * (max - min) + min;
}

const launchConfetti = () => {
	confetti({
		angle: randomInRange(55, 125),
		spread: randomInRange(50, 70),
		particleCount: randomInRange(50, 100),
		origin: { y: 0.6 },
	});
};

async function toggleTask(task) {
	const newStatus = task.status === 'completed' ? 'active' : 'completed';
	try {
		await updateItem('tasks', task.id, { status: newStatus });

		const index = localTasks.value.findIndex((t) => t.id === task.id);
		if (index !== -1) {
			localTasks.value[index] = { ...localTasks.value[index], status: newStatus };
		}
		if (newStatus === 'completed') {
			console.log(progress.value);
			if (progress.value === 100) {
				startConfetti();
				toast.add({
					title: 'Set status to completed?',
					timeout: 7000,
					actions: [
						{
							label: 'Yes',
							click: async () => {
								await updateItem('tickets', props.ticketId, { status: 'Completed' });
								router.push('/tickets');
							},
						},
						{
							label: 'No',
							click: () => {
								toast.remove();
							},
						},
					],
				});
			} else {
				launchConfetti();
			}
		}
	} catch (error) {
		console.error('Error toggling task:', error);
		toast.add({
			title: 'Error Toggling Task',
			description: 'Failed to toggle the task status. Please try again.',
			color: 'red',
		});
	}
}

async function removeTask(taskId) {
	try {
		await deleteItem('tasks', taskId);
		localTasks.value = localTasks.value.filter((task) => task.id !== taskId);
	} catch (error) {
		console.error('Error removing task:', error);
		toast.add({
			title: 'Error Removing Task',
			description: 'Failed to remove the task. Please try again.',
			color: 'red',
		});
	}
}

async function handleDragEnd() {
	try {
		const updatePromises = localTasks.value.map((task, index) => updateItem('tasks', task.id, { sort: index }));

		await Promise.all(updatePromises);
	} catch (error) {
		console.error('Failed to update task order:', error);
		toast.add({
			title: 'Error Updating Task Order',
			description: 'Failed to update the task order. Please try again.',
			color: 'red',
		});
		localTasks.value = [...remoteTasks.value].sort((a, b) => a.sort - b.sort);
	}
}

const formatCompletionDate = (date) => {
	return new Date(date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const formatDate = (date) => {
	return new Date(date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const getCreatorInfo = (task) => {
	if (!task.user_created) return 'Unknown user';
	return `Created by ${task.user_created.first_name} ${task.user_created.last_name}\non ${formatDate(task.date_created)}`;
};

const editingTaskId = ref(null); // Track which task is being edited

// Save updated task description
async function updateTaskDescription(taskId, newDescription) {
	if (!newDescription.trim()) return;

	try {
		if (mentionedUsers.value.size > 0) {
			await notifyMentionedUsers(newDescription, 'tasks', taskId);
		}

		const index = localTasks.value.findIndex((task) => task.id === taskId);
		if (index !== -1) {
			// Optimistic update
			localTasks.value[index].description = newDescription;

			await updateItem('tasks', taskId, { description: newDescription });
		}
	} catch (error) {
		console.error('Failed to update task description:', error);
		toast.add({
			title: 'Error Updating Task Description',
			description: 'Failed to update the task description. Please try again.',
			color: 'red',
		});
		// Revert title on failure
		localTasks.value.forEach((task, index) => {
			if (task.id === taskId) {
				localTasks.value[index].description = remoteTasks.value.find((t) => t.id === taskId)?.description || '';
			}
		});
	} finally {
		editingTaskId.value = null;
	}
}

function startConfetti(duration = 4000) {
	const end = Date.now() + duration;
	const colors = ['#00bfff', '#0ef62d', '#e8fc00', '#ffcc00', '#ff005c', '#ff00cc', '#502989'];

	function frame() {
		confetti({
			particleCount: 6,
			angle: 60,
			spread: 55,
			origin: { x: 0 },
			colors: colors,
		});
		confetti({
			particleCount: 3,
			angle: 120,
			spread: 55,
			origin: { x: 1 },
			colors: colors,
		});

		if (Date.now() < end) {
			requestAnimationFrame(frame);
		}
	}

	frame();
}
function stopEditing(taskId, newDescription) {
	if (editingTaskId.value === taskId) {
		editingTaskId.value = null;
		updateTaskDescription(taskId, newDescription);
	}
}

const progress = computed(() => {
	if (localTasks.value.length === 0) return 0;
	const completedTasks = localTasks.value.filter((task) => task.status === 'completed').length;
	return Math.round((completedTasks / localTasks.value.length) * 100);
});

const previousCompletedTasks = ref(null);

const completedTasksCount = computed(() => {
	return localTasks.value.filter((task) => task.status === 'completed').length;
});

watch(
	() => localTasks.value,
	(newTasks) => {
		previousCompletedTasks.value = newTasks.filter((task) => task.status === 'completed').length;
	},
	{ deep: true, immediate: true },
);

const motivationalMessage = computed(() => {
	const totalTasks = localTasks.value.length;
	const completedTasks = completedTasksCount.value;
	console.log(completedTasks.length);
	console.log(previousCompletedTasks.value);
	console.log(completedTasks < previousCompletedTasks.value);
	console.log(previousCompletedTasks.value !== null);
	console.log(previousCompletedTasks.value !== null && completedTasks < previousCompletedTasks.value);
	let message = '';
	if (isLoading.value) {
		message = 'Loading tasks...';
	} else if (isConnected.value === false && isLoading.value === false) {
		message = 'You are offline. Changes will be synced when you are back online.';
	} else if (previousCompletedTasks.value !== null && completedTasks < previousCompletedTasks.value) {
		message = "Uh oh...looks like you're going backwards. Need help? 🤨";
	} else if (completedTasks === 0) {
		message = `Okay ${currentUser.value.first_name}, create a task to get started! ✏️`;
	} else if (completedTasks < totalTasks / 3) {
		message = "Keep going...you're making progress.👍";
	} else if (completedTasks < totalTasks - 2) {
		message = `You're doing great ${currentUser.value.first_name}...stay focused and keep going! 🤓`;
	} else if (completedTasks < totalTasks) {
		message = 'Look at you 👀...just a few more to complete.💪';
	} else {
		message = `Congratulations ${currentUser.value.first_name} you've completed all tasks! 👏💃🏻🕺🏻🍾`;
	}

	previousCompletedTasks.value = completedTasks; // Update AFTER message is determined

	return message;
});

onMounted(() => {
	connect();
});

onUnmounted(() => {
	disconnect();
});
</script>

<template>
	<div class="w-full space-y-4 relative bg-[var(--yellowGradient)]">
		<transition name="fade">
			<div
				v-if="isLoading"
				class="absolute inset-0 bg-white/70 dark:bg-gray-800/70 z-50 flex items-center justify-center"
			>
				<LayoutLoader text="Loading Tasks" />
			</div>
		</transition>

		<transition name="fade">
			<div v-if="!isConnected && !isLoading" class="mb-4 absolute right-0 top-0 tasks__connection">
				<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
					<template #footer>
						<UButton size="sm" color="yellow" @click="refresh">Retry Connection</UButton>
					</template>
				</UAlert>
			</div>
		</transition>
		<div class="transform scale-50 xl:scale-75 absolute -top-[90px] xl:-top-[120px] -right-10 xl:-right-20">
			<TicketsProgressCircle :progressPercentage="progress" />
		</div>

		<div class="flex flex-col items-start">
			<p class="text-[12px] text-gray-700 dark:text-gray-300">{{ motivationalMessage }}</p>
		</div>
		<div class="flex items-center space-x-2">
			<FormTiptap
				:showToolbar="false"
				v-model="newTask"
				placeholder="Add a new task..."
				class="w-full text-xs"
				height="h-12"
				custom-classes="p-2 text-[12px]"
				@keyup.enter="addTask"
				@mention="handleMention"
				:showCharCount="false"
			/>
			<UButton color="gray" variant="soft" icon="i-heroicons-plus" :disabled="!newTask.trim()" @click="addTask" />
		</div>
		<div v-if="!isConnected && isLoading" class="w-full text-[10px] text-center mt-20 uppercase"></div>
		<draggable
			v-else
			v-model="localTasks"
			:animation="200"
			item-key="id"
			handle=".drag-handle"
			class="space-y-2"
			@end="handleDragEnd"
		>
			<template #item="{ element: task }">
				<div class="flex items-center space-x-3 group bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm">
					<UButton
						color="gray"
						variant="ghost"
						icon="i-heroicons-bars-3"
						size="xs"
						class="drag-handle cursor-move opacity-0 group-hover:opacity-100 transition-opacity"
					/>
					<UCheckbox :model-value="task.status === 'completed'" @update:model-value="() => toggleTask(task)" />
					<div class="relative flex-1">
						<FormTiptap
							v-if="editingTaskId === task.id"
							:showToolbar="false"
							v-model="task.description"
							class="w-full text-xs"
							height="h-8"
							custom-classes="px-2 py-1 text-[10px]"
							@keyup.enter="stopEditing(task.id, task.description)"
							@blur="stopEditing(task.id, task.description)"
							@mention="handleMention"
						/>

						<div
							v-else
							@click="editingTaskId = task.id"
							:class="{ 'line-through text-gray-400': task.status === 'completed' }"
							class="cursor-pointer text-xs leading-4 inline-block"
							v-html="task.description"
						></div>

						<div
							v-if="task.status === 'completed'"
							class="text-[8px] text-gray-500 mt-0.5 uppercase absolute left-0 -bottom-[10px]"
						>
							Completed {{ formatCompletionDate(task.date_updated) }} by
							{{ task.user_updated ? ` ${task.user_updated.first_name}` : '' }}
						</div>
					</div>
					<UTooltip :text="getCreatorInfo(task)">
						<UButton
							color="gray"
							variant="ghost"
							icon="i-heroicons-information-circle"
							size="xs"
							class="opacity-0 group-hover:opacity-100 transition-opacity"
						/>
					</UTooltip>
					<UButton
						color="gray"
						variant="ghost"
						icon="i-heroicons-trash"
						size="xs"
						class="opacity-0 group-hover:opacity-100 transition-opacity"
						@click="removeTask(task.id)"
					/>
				</div>
			</template>
		</draggable>
	</div>
</template>

<style scoped>
.drag-handle {
	touch-action: none;
}

.tasks {
	&__connection {
		@apply max-w-[2000px];
	}
}
</style>
