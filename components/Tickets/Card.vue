<template>
	<div class="ticket-card bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all mb-4">
		<div class="p-3 space-y-2" @click="$emit('expand')">
			<!-- Ticket Header -->
			<div class="flex items-start justify-between">
				<span class="text-gray-500 font-medium text-[8px] italic">{{ element?.id }}</span>
				<UBadge v-if="element?.priority" :color="getPriorityColor(element.priority)" variant="subtle" size="xs">
					{{ element.priority }}
				</UBadge>
			</div>

			<!-- Ticket Title -->
			<h4 class="font-medium text-sm line-clamp-2">{{ element?.title }}</h4>

			<!-- Categories -->
			<!-- <div v-if="element?.category" class="flex flex-wrap gap-1">
				<UBadge
					v-for="category in getCategories"
					:key="category"
					color="gray"
					variant="subtle"
					size="xs"
					class="truncate max-w-[150px]"
				>
					{{ category.trim() }}
				</UBadge>
			</div> -->

			<!-- Assigned Users -->
			<div class="flex items-center justify-between text-xs text-gray-500">
				<div class="flex items-center">
					<!-- Avatar Stack -->
					<div class="flex -space-x-1">
						<template v-if="assignedUsers.length">
							<UTooltip v-for="user in displayUsers" :key="user.id" :text="getUserFullName(user)">
								<UAvatar
									:src="getAvatarUrl(user)"
									:alt="getUserFullName(user)"
									size="xs"
									:class="{
										'ring-2 ring-cyan-500 ring-offset-2 shadow-lg dark:ring-offset-gray-800': isCurrentUser(user),
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

						<span v-else class="text-gray-500">Unassigned</span>
					</div>
				</div>

				<span>{{ formatDate(element?.date_updated) }}</span>
			</div>
		</div>
		<ReactionsBar :item-id="element.id" collection="tickets" />
	</div>
</template>

<script setup>
const props = defineProps({
	element: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['expand']);

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

const getCategories = computed(() => (props.element?.category ? props.element.category.split(',') : []));

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

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	return `${user.first_name} ${user.last_name}`.trim();
};

const formatDate = (date) => {
	if (!date) return '';
	return new Date(date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};
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
</style>
