<template>
	<div class="w-full mb-4 transition-all ticket-card">
		<div
			class="bg-white dark:bg-gray-800 shadow-lg hover:shadow-md transition-all rounded-sm w-full p-4 relative"
			:class="
				formatDueDateStatus(element?.due_date) === 'urgent' || formatDueDateStatus(element?.due_date) === 'past'
					? 'border-red-200 border-2'
					: ''
			"
		>
			<!-- @click="$emit('expand')" -->
			<!-- Ticket Header -->
			<div class="flex items-start justify-between my-2">
				<nuxt-link :to="`/tickets/${element.id}`" class="flex flex-row">
					<span class="text-gray-500 font-medium text-[10px] italic">{{ element?.id }}</span>
					<UPopover mode="hover" :popper="{ offsetDistance: 5 }">
						<UButton
							color="gray"
							variant="ghost"
							icon="i-heroicons-information-circle"
							size="xs"
							class="p-0 ml-1 -mt-1"
						/>
						<template #panel>
							<div class="p-2 text-gray-500 font-medium text-[10px]">
								<span v-html="getTicketInfo"></span>
							</div>
						</template>
					</UPopover>
				</nuxt-link>

				<UBadge
					v-if="element?.priority"
					:color="getPriorityColor(element.priority)"
					variant="subtle"
					size="xs"
					class="relative uppercase text-[9px]"
				>
					<!-- Display priority text -->
					{{ element.priority }}

					<!-- Pulsing ring for urgent priority -->
					<span
						v-if="element.priority === 'urgent'"
						class="absolute inset-0 rounded-full border border-current animate-ping"
					></span>
				</UBadge>
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
			<h5 class="text-gray-800 text-[8px] mt-0 uppercase mb-2">{{ element?.organization.name }}</h5>

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
			<div v-if="element?.due_date" class="">
				<h5 v-if="assignedUsers.length" class="text-gray-500 uppercase text-[8px] text-bold tracking-wider w-full">
					Due Date:
				</h5>
				<p class="uppercase text-[10px]" :class="formatDueDateStatus(element?.due_date)">
					{{ formatDueDate(element?.due_date) }}
					<UIcon
						name="i-heroicons-exclamation-triangle-solid"
						class="w-4 h-4 inline-block mr-1 -mb-1.5"
						v-if="
							formatDueDateStatus(element?.due_date) === 'urgent' || formatDueDateStatus(element?.due_date) === 'past'
						"
					/>
				</p>
			</div>

			<!-- <nuxt-link
				:to="`/tickets/${element.id}`"
				class="text-[10px] uppercase tracking-wide text-right block absolute right-4 bottom-4 px-2"
			>
				Details
				<UIcon name="i-heroicons-arrow-right" size="sm" class="inline-block ml-0.5 -mb-[1px] p-0" />
			</nuxt-link> -->
		</div>
		<div
			class="w-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-md mt-1 rounded-sm flex flex-row items-center justify-between transition-all"
		>
			<!-- Ticket Footer -->

			<ReactionsBar :item-id="element.id" collection="tickets" />
			<div class="flex flex-row text-xs text-gray-500 mr-3">
				<div v-if="commentCount > 0" class="flex items-center gap-1">
					<UTooltip :text="commentCount + ' comments'" :popper="{ arrow: true }">
						<UIcon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4 inline-block mr-1" />
						{{ commentCount }}
					</UTooltip>
				</div>
				<div v-if="taskCount > 0" class="ml-2 flex items-center gap-1">
					<UTooltip :text="taskCount + ' tasks'" :popper="{ arrow: true }">
						<UIcon name="i-heroicons-check-circle" class="w-4 h-4 inline-block mr-1" />
						{{ taskCount }}
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
	commentCount: {
		type: Number,
		default: 0,
	},
	taskCount: {
		type: Number,
		default: 0,
	},
});

// const emit = defineEmits(['expand']);

const { user } = useDirectusAuth();

// Get all assigned users
const assignedUsers = computed(() => {
	return props.element?.assigned_to?.map((assignment) => assignment.directus_users_id) || [];
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
		high: 'yellow',
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
