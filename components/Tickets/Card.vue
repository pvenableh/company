<template>
	<div class="w-full mb-4 transition-all ticket-card">
		<div class="bg-white dark:bg-gray-800 shadow-lg transition-all rounded-sm w-full p-4 relative">
			<div class="flex items-start justify-between my-2 h-8">
				<div v-if="element?.status !== 'Completed'" class="w-full relative flex flex-row items-center justify-start">
					<p class="text-[10px] leading-[16px] uppercase">
						<span class="opacity-50">Priority:</span>
						<span class="font-bold ml-1" :class="`text-${getPriorityColor(element.priority)}-500`">
							{{ element?.priority }}
						</span>
					</p>
				</div>

				<div class="transform scale-[0.45] absolute -right-[15px] -top-[25px]">
					<TicketsProgressCircle :progressPercentage="progress" />
				</div>
			</div>

			<!-- Ticket Title -->
			<nuxt-link :to="`/tickets/${element.id}`">
				<h4 class="font-bold text-[16px] line-clamp-2 mt-2">
					{{ element?.title }}
					<UIcon
						name="i-heroicons-arrow-right"
						size="xs"
						class="inline-block ml-0.5 -mb-[3px] p-0 scale-75 opacity-50"
					/>
				</h4>
			</nuxt-link>
			<h5 v-if="element?.team" class="text-gray-800 text-[8px] mt-0 uppercase mb-2">
				<UIcon name="i-heroicons-user-group" />
				{{ element?.team?.name }}
			</h5>
			<h5 v-if="element?.organization" class="text-gray-800 text-[8px] mt-0 uppercase mb-2">
				<UIcon name="i-heroicons-building-office" />
				{{ element?.organization?.name }}
			</h5>

			<!-- Assigned Users -->
			<div class="w-full flex flex-col items-center justify-between text-xs text-gray-500 my-4">
				<h5 v-if="assignedUsers.length" class="text-gray-500 uppercase text-[8px] text-bold tracking-wider w-full">
					Assigned to:
				</h5>
				<div class="w-full flex items-center">
					<!-- Avatar Stack -->
					<div class="flex -space-x-1">
						<template v-if="assignedUsers.length">
							<UTooltip v-for="(user, index) in displayUsers" :key="index" :text="getUserFullName(user)">
								<UAvatar
									:src="getAvatarUrl(user)"
									:alt="getUserFullName(user)"
									size="xs"
									:class="{
										'ring-2 ring-cyan-500 ring-offset-2 scale-90 shadow-lg dark:ring-offset-gray-800':
											isCurrentUser(user),
										'-ml-1': true,
									}"
								/>
							</UTooltip>

							<!-- Additional users count -->
							<UTooltip v-if="additionalUsersCount > 0" :text="getAdditionalUsersTooltip">
								<div
									class="-ml-2 flex items-center justify-center w-6 h-6 text-xs font-medium text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-700 rounded-full border-2 border-white dark:border-gray-800"
								>
									+{{ additionalUsersCount }}
								</div>
							</UTooltip>
						</template>

						<span v-else class="">
							<UTooltip text="Unassigned">
								<UAvatar icon="i-heroicons-user" size="xs" />
							</UTooltip>
						</span>
					</div>
				</div>
			</div>
			<div v-if="element?.due_date && element?.status !== 'Completed'" class="">
				<h5 v-if="assignedUsers.length" class="text-gray-500 uppercase text-[8px] text-bold tracking-wider w-full">
					Due Date:
				</h5>
				<p class="uppercase text-[10px]" :class="formatDueDateStatus(element?.due_date)">
					<span
						v-if="
							formatDueDateStatus(element?.due_date) === 'urgent' || formatDueDateStatus(element?.due_date) === 'past'
						"
						class="h-[7px] w-[15px] inline-block bg-red-500"
					></span>
					{{ formatDueDate(element?.due_date) }}
					<!-- <UIcon
						name="i-heroicons-exclamation-triangle-solid"
						class="w-4 h-4 inline-block mr-1 -mb-1.5"
						v-if="
							formatDueDateStatus(element?.due_date) === 'urgent' || formatDueDateStatus(element?.due_date) === 'past'
						"
					/> -->
				</p>
			</div>
			<div v-else class="">
				<h5 class="text-gray-500 uppercase text-[8px] text-bold tracking-wider w-full">Date Completed:</h5>
				<p class="uppercase text-[10px]">
					{{ getFriendlyDate(element?.date_updated) }}
				</p>
			</div>
			<div class="absolute bottom-2 right-4">
				<div class="flex flex-row items-center relative">
					<UPopover mode="click" :popper="{ placement: 'left', offsetDistance: 3 }">
						<UButton color="gray" variant="ghost" icon="i-heroicons-information-circle" size="xs" />
						<template #panel>
							<div class="p-2 text-gray-500 font-medium text-[10px]">
								<span v-html="getTicketInfo"></span>
							</div>
						</template>
					</UPopover>
					<!-- <UButton color="gray" variant="ghost" icon="i-heroicons-trash" size="xs" @click="deleteTicket(element?.id)" /> -->
				</div>
			</div>
		</div>
		<div
			class="w-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-md mt-1 rounded-sm flex flex-row items-center justify-between transition-all"
		>
			<!-- Ticket Footer -->

			<ReactionsBar :item-id="element.id" collection="tickets" />
			<div class="flex flex-row text-xs text-gray-500 mr-3">
				<div v-if="commentsCount > 0" class="flex items-center gap-1">
					<UTooltip :text="commentsCount + (commentsCount === 1 ? ' Comment' : ' Comments')" :popper="{ arrow: true }">
						<UIcon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4 inline-block mr-1" />
						{{ commentsCount }}
					</UTooltip>
				</div>

				<div v-if="tasksCount > 0" class="ml-2 flex items-center gap-1">
					<UTooltip :text="tasksCount + ' tasks'" :popper="{ arrow: true }">
						<UIcon name="i-heroicons-check-circle" class="w-4 h-4 inline-block mr-1" />
						{{ tasksCount }}
					</UTooltip>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	element: {
		type: Object,
		required: true,
	},
	comments: {
		type: Number,
		default: 0,
	},
	tasks: {
		type: Number,
		default: 0,
	},
});

console.log('Comments:', props.element.comments);

// const emit = defineEmits(['expand']);

const { user } = useEnhancedAuth();

const commentsCount = computed(() => {
	// If element.commentsCount exists, use it (this is our explicitly set number)
	if (typeof props.element.commentsCount === 'number') {
		return props.element.commentsCount;
	}

	// If comments is a number, return it directly
	if (typeof props.element.comments === 'number') {
		return props.element.comments;
	}

	// If comments is an array, return its length
	if (Array.isArray(props.element.comments)) {
		return props.element.comments.length;
	}

	// Default to 0 if undefined or null
	return 0;
});

const tasksCount = computed(() => {
	if (typeof props.element.tasks === 'number') {
		return props.element.tasks;
	}
	if (Array.isArray(props.element.tasks)) {
		return props.element.tasks.length;
	}
	return 0;
});

// Get all assigned users
const assignedUsers = computed(() => {
	return props.element?.assigned_to?.map((assignment) => assignment.directus_users_id) || [];
});

const progress = computed(() => {
	// If tasks is a number, we can't calculate progress (no task status data)
	if (typeof props.element.tasks === 'number') {
		return 0;
	}

	// If there are no tasks, return 0
	if (!props.element.tasks || !Array.isArray(props.element.tasks) || props.element.tasks.length === 0) {
		return 0;
	}

	// Count completed tasks
	const completedTasks = props.element.tasks.filter((task) => task && task.status === 'completed').length;

	// Calculate percentage
	return Math.round((completedTasks / props.element.tasks.length) * 100);
});

// Maximum number of avatars to display
const MAX_DISPLAYED_USERS = 3;

// Users to display in the avatar stack
const displayUsers = computed(() => {
	// Sort array to put current user first if they're assigned
	return [...assignedUsers.value]
		.sort((a, b) => {
			if (isCurrentUser(a)) return -1;
			if (isCurrentUser(b)) return 1;
			return 0;
		})
		.slice(0, MAX_DISPLAYED_USERS);
});

// Count of additional users not shown
const additionalUsersCount = computed(() => {
	return Math.max(0, assignedUsers.value.length - MAX_DISPLAYED_USERS);
});

// Tooltip text for additional users
const getAdditionalUsersTooltip = computed(() => {
	const additionalUsers = assignedUsers.value
		.slice(MAX_DISPLAYED_USERS)
		.map((user) => getUserFullName(user))
		.join(', ');
	return `Also assigned: ${additionalUsers}`;
});

// Check if a user is the current authenticated user
const isCurrentUser = (assignedUser) => {
	return assignedUser?.id === user?.value?.id;
};

// Utility functions
const getPriorityColor = (priority) => {
	const colors = {
		low: 'gray',
		medium: 'blue',
		high: 'red',
		urgent: 'red',
	};
	return colors[priority] || 'gray';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const getUserFullName = (assignedUser) => {
	if (!assignedUser) return 'Unknown';
	if (assignedUser.id === user.value.id) return 'You';
	return `${assignedUser.first_name} ${assignedUser.last_name}`.trim();
};

// const formatDate = (date) => {
// 	if (!date) return '';
// 	return new Date(date).toLocaleDateString('en-US', {
// 		month: 'short',
// 		day: 'numeric',
// 		hour: '2-digit',
// 		minute: '2-digit',
// 	});
// };

const getTicketInfo = computed(() => {
	if (!props.element) return '';

	const creator =
		props.element.user_created?.first_name && props.element.user_created?.last_name
			? `${props.element.user_created.first_name} ${props.element.user_created.last_name}`
			: 'Unknown';

	const updater =
		props.element.user_updated?.first_name && props.element.user_updated?.last_name
			? `${props.element.user_updated.first_name} ${props.element.user_updated.last_name}`
			: 'Unknown';

	const created = new Date(props.element.date_created).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});

	const updated = new Date(props.element.date_updated).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});

	const person = creator === updater ? `Created by: ${creator}` : `Updated by: ${updater}`;
	const time = creator === updater ? `Created on: ${created}` : `Updated on: ${updated}`;

	return `${person} <br/> ${time}`;
});
</script>

<style scoped>
/* Smooth transitions for avatar highlighting */
.u-avatar {
	transition: all 0.2s ease-in-out;
}

/* Optional: Add hover effect for avatars */
.u-avatar:hover {
	transform: translateY(-2px);
	z-index: 10;
}
.urgent,
.past {
	@apply text-red-500;
}
.medium {
	@apply text-yellow-500;
}
</style>
