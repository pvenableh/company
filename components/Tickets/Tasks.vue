<script setup>
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';
import draggable from 'vuedraggable';

const { user: currentUser } = useDirectusAuth();
const { createItem, updateItem, deleteItem } = useDirectusItems();
const { notify } = useNotifications();
const mentionedUsers = ref(new Set());
const newTask = ref('');

const props = defineProps({
	ticketId: {
		type: String,
		required: true,
	},
});

const localTasks = ref([]);
const isInitialized = ref(false);

const { data: remoteTasks } = useRealtimeSubscription(
	'tasks',
	[
		'*',
		'user_created.first_name',
		'user_created.last_name',
		'user_updated.first_name',
		'user_updated.last_name',
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

// Modified watch to handle updates after initialization
watch(
	remoteTasks,
	(newTasks) => {
		if (!isInitialized.value && newTasks.length) {
			localTasks.value = [...newTasks].sort((a, b) => a.sort - b.sort);
			isInitialized.value = true;
		} else if (isInitialized.value) {
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
	{ deep: true },
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
	}
}

async function addTask() {
	if (!newTask.value.trim()) return;

	const newTaskId = await createItem('tasks', {
		description: newTask.value,
		ticket_id: props.ticketId,
		status: 'active',
		sort: localTasks.value.length,
	});

	console.log(newTaskId);

	if (mentionedUsers.value.size > 0) {
		const result = await notifyMentionedUsers(newTask.value, 'tasks', newTaskId.id);
		console.log(result);
	}

	newTask.value = '';
	// Removed manual addition to localTasks
}

async function toggleTask(task) {
	const newStatus = task.status === 'completed' ? 'active' : 'completed';
	await updateItem('tasks', task.id, { status: newStatus });

	const index = localTasks.value.findIndex((t) => t.id === task.id);
	if (index !== -1) {
		localTasks.value[index] = { ...localTasks.value[index], status: newStatus };
	}
}

async function removeTask(taskId) {
	await deleteItem('tasks', taskId);
	localTasks.value = localTasks.value.filter((task) => task.id !== taskId);
}

async function handleDragEnd() {
	const updatePromises = localTasks.value.map((task, index) => updateItem('tasks', task.id, { sort: index }));

	try {
		await Promise.all(updatePromises);
	} catch (error) {
		console.error('Failed to update task order:', error);
		localTasks.value = [...remoteTasks.value].sort((a, b) => a.sort - b.sort);
	}
}

// const handleTaskUpdate = () => {
// 	refresh();
// };

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

	if (mentionedUsers.value.size > 0) {
		const result = await notifyMentionedUsers(newDescription, 'tasks', taskId);
		console.log(result);
	}

	const index = localTasks.value.findIndex((task) => task.id === taskId);
	if (index !== -1) {
		// Optimistic update
		localTasks.value[index].description = newDescription;

		try {
			await updateItem('tasks', taskId, { description: newDescription });
		} catch (error) {
			console.error('Failed to update task description:', error);
			// Revert title on failure
			localTasks.value[index].description = remoteTasks.value.find((t) => t.id === taskId)?.description || '';
		}
	}
}
function stopEditing(taskId, newDescription) {
	if (editingTaskId.value === taskId) {
		editingTaskId.value = null;
		updateTaskDescription(taskId, newDescription);
	}
}
</script>

<template>
	<div class="space-y-4">
		<div class="flex items-center space-x-2">
			<!-- <UInput v-model="newTask" placeholder="Add a new task..." class="flex-1" @keyup.enter="addTask" /> -->
			<FormTiptap
				:showToolbar="false"
				v-model="newTask"
				placeholder="Add a new task..."
				class="w-full text-xs"
				height="h-12"
				custom-classes="p-2 text-[12px]"
				@keyup.enter="addTask"
				@mention="handleMention"
			/>
			<UButton color="gray" variant="soft" icon="i-heroicons-plus" :disabled="!newTask.trim()" @click="addTask" />
		</div>

		<draggable
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

						<!-- Display Mode -->
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
						<!-- <div class="mt-4 border-t pt-4">
							<TasksTaskAssignment :task="task" @update="handleTaskUpdate" />
						</div> -->
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
</style>
