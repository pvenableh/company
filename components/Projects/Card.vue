<script setup>
const props = defineProps({
	project: {
		type: Object,
		default: () => null,
	},
	columns: {
		type: Array,
		default: () => [],
	},
});

const { data, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? data?.value?.user ?? null : null;
});

const assignedUsers = computed(() => {
	return props.project?.assigned_to?.map((assignment) => assignment.directus_users_id) || [];
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

const getUserFullName = (assignedUser) => {
	if (!assignedUser) return 'Unknown';
	if (assignedUser.id === user.value.id) return 'You';
	return `${assignedUser.first_name} ${assignedUser.last_name}`.trim();
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

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
</script>
<template>
	<nuxt-link :to="`/projects/${project.id}`" class="inline-block w-full mb-2 transition-all project-card">
		<div class="bg-white dark:bg-gray-800 shadow-lg hover:shadow-md transition-all rounded-sm w-full p-4">
			<h5
				class="text-[8px] inline-flex rounded-full px-2 py-0.5 text-black uppercase"
				:style="{ background: project.service?.color }"
			>
				{{ project.service?.name }}
			</h5>
			<h3 class="font-medium">{{ project.title }}</h3>
			<h5 class="text-sm text-gray-600">{{ project.organization?.name }}</h5>
			<!-- Assigned Users -->
			<div class="w-full flex items-center justify-between text-xs text-gray-500 mt-4">
				<div class="flex items-center">
					<!-- Avatar Stack -->
					<div class="flex -space-x-1">
						<template v-if="assignedUsers.length">
							<UTooltip v-for="(user, index) in displayUsers" :key="index" :text="getUserFullName(user)">
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

						<span v-else class="text-gray-500 uppercase text-[8px] text-bold tracking-wider">Unassigned</span>
					</div>
				</div>
			</div>
		</div>
		<div
			v-if="project.events.length > 0 || project.tickets.length > 0"
			class="w-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-md mt-1 px-2 py-1 rounded-sm flex flex-row items-center justify-between transition-all"
		>
			<!-- Ticket Footer -->

			<div class="flex flex-row text-xs text-gray-500 mr-3">
				<div v-if="project.events.length > 0" class="flex items-center gap-1">
					<UTooltip :text="project.events.length + ' events'" :popper="{ arrow: true }">
						<UIcon name="i-heroicons-clock" class="w-4 h-4 inline-block mr-1" />
						{{ project.events.length }}
					</UTooltip>
				</div>
				<div v-if="project.tickets.length > 0" class="ml-2 flex items-center gap-1">
					<UTooltip :text="project.tickets.length + ' tickets'" :popper="{ arrow: true }">
						<UIcon name="i-heroicons-square-3-stack-3d" class="w-4 h-4 inline-block mr-1" />
						{{ project.tickets.length }}
					</UTooltip>
				</div>
			</div>
		</div>
	</nuxt-link>
</template>
