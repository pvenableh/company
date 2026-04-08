<template>
	<div class="w-full mb-3 transition-all group ios-press">
		<div class="ticket-card p-4 relative">
			<!-- Header: Priority + Progress -->
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<span
						v-if="element?.status !== 'Completed'"
						class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
						:class="priorityStyle"
					>
						{{ element?.priority }}
					</span>
					<span
						v-else
						class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md text-emerald-500 bg-emerald-500/10"
					>
						Completed
					</span>
				</div>
				<!-- Action buttons -->
				<div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
					<UTooltip text="Archive" :popper="{ arrow: true }">
						<UButton
							color="gray"
							variant="ghost"
							icon="i-heroicons-archive-box-arrow-down"
							size="xs"
							@click="$emit('archive', element?.id)"
						/>
					</UTooltip>
					<UPopover mode="click" :popper="{ placement: 'left', offsetDistance: 3 }">
						<UButton color="gray" variant="ghost" icon="i-heroicons-information-circle" size="xs" />
						<template #panel>
							<div class="p-2.5 text-muted-foreground font-medium text-[10px] leading-relaxed">
								<span v-html="getTicketInfo"></span>
							</div>
						</template>
					</UPopover>
				</div>
			</div>

			<!-- Title -->
			<nuxt-link :to="`/tickets/${element.id}`" class="block mb-3">
				<h4 class="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
					{{ element?.title }}
					<UIcon
						name="i-heroicons-arrow-right"
						size="xs"
						class="inline-block ml-0.5 -mb-[2px] scale-75 opacity-0 group-hover:opacity-50 transition-opacity"
					/>
				</h4>
			</nuxt-link>

			<!-- Meta: Client/Organization & Team -->
			<div v-if="element?.client || element?.organization || element?.team" class="flex flex-col gap-1 mb-3">
				<div v-if="element?.client || element?.organization" class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<UIcon name="i-heroicons-building-office" class="w-3.5 h-3.5 flex-shrink-0" />
					<span class="truncate">{{ element?.client?.name || element?.organization?.name }}</span>
				</div>
				<div v-if="element?.team" class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<UIcon name="i-heroicons-user-group" class="w-3.5 h-3.5 flex-shrink-0" />
					<span class="truncate">{{ element?.team?.name }}</span>
				</div>
			</div>

			<!-- Progress Bar (tasks) -->
			<div v-if="progress > 0" class="mb-3">
				<div class="flex items-center justify-between text-[10px] mb-1">
					<span class="text-muted-foreground">Tasks</span>
					<span class="font-semibold" :class="progress >= 90 ? 'text-emerald-500' : progress >= 50 ? 'text-blue-500' : 'text-muted-foreground'">
						{{ progress }}%
					</span>
				</div>
				<div class="h-1 bg-muted rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-500"
						:class="progress >= 90 ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : progress >= 25 ? 'bg-amber-500' : 'bg-red-500'"
						:style="{ width: progress + '%' }"
					/>
				</div>
			</div>

			<!-- Assigned Users -->
			<div class="flex items-center justify-between mb-3">
				<div class="flex -space-x-1.5">
					<template v-if="assignedUsers.length">
						<UTooltip v-for="(user, index) in displayUsers" :key="index" :text="getUserFullName(user)">
							<UAvatar
								:src="getAvatarUrl(user)"
								:alt="getUserFullName(user)"
								size="xs"
								:class="{
									'ring-2 ring-primary/30 ring-offset-1 ring-offset-card': isCurrentUser(user),
								}"
							/>
						</UTooltip>
						<UTooltip v-if="additionalUsersCount > 0" :text="getAdditionalUsersTooltip">
							<div
								class="flex items-center justify-center w-6 h-6 text-[10px] font-semibold text-muted-foreground bg-muted/60 rounded-full border-2 border-card"
							>
								+{{ additionalUsersCount }}
							</div>
						</UTooltip>
					</template>
					<UTooltip v-else text="Unassigned">
						<UAvatar icon="i-heroicons-user" size="xs" class="opacity-40" />
					</UTooltip>
				</div>

				<!-- Due Date / Completed Date -->
				<div v-if="element?.due_date && element?.status !== 'Completed'">
					<span
						class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md inline-flex items-center gap-1"
						:class="dueDateStyle"
					>
						<UIcon
							v-if="dueDateUrgency === 'past' || dueDateUrgency === 'urgent'"
							name="i-heroicons-exclamation-triangle"
							class="w-3 h-3"
						/>
						<UIcon v-else name="i-heroicons-calendar" class="w-3 h-3" />
						{{ formatDueDate(element?.due_date) }}
					</span>
				</div>
				<div v-else-if="element?.status === 'Completed'" class="text-[10px] text-muted-foreground">
					{{ getFriendlyDate(element?.date_updated) }}
				</div>
			</div>

			<!-- Footer: Reactions + Counts -->
			<div class="flex items-center justify-between pt-3 border-t border-border/40">
				<ReactionsBar :item-id="element.id" collection="tickets" />
				<div class="flex items-center gap-3 text-xs text-muted-foreground">
					<UTooltip v-if="commentsCount > 0" :text="commentsCount + (commentsCount === 1 ? ' Comment' : ' Comments')" :popper="{ arrow: true }">
						<div class="flex items-center gap-1">
							<UIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5" />
							<span class="text-[11px]">{{ commentsCount }}</span>
						</div>
					</UTooltip>
					<UTooltip v-if="tasksCount > 0" :text="tasksCount + ' tasks'" :popper="{ arrow: true }">
						<div class="flex items-center gap-1">
							<UIcon name="i-heroicons-check-circle" class="w-3.5 h-3.5" />
							<span class="text-[11px]">{{ tasksCount }}</span>
						</div>
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
});

const emit = defineEmits(['archive']);

const { user } = useDirectusAuth();

// Priority styling
const priorityStyle = computed(() => {
	const styles = {
		low: 'text-gray-500 bg-gray-500/10',
		medium: 'text-blue-500 bg-blue-500/10',
		high: 'text-orange-500 bg-orange-500/10',
		urgent: 'text-red-500 bg-red-500/10',
	};
	return styles[props.element?.priority] || styles.low;
});

// Due date urgency
const dueDateUrgency = computed(() => formatDueDateStatus(props.element?.due_date));

const dueDateStyle = computed(() => {
	const styles = {
		past: 'text-red-500 bg-red-500/10',
		urgent: 'text-orange-500 bg-orange-500/10',
		medium: 'text-yellow-600 bg-yellow-500/10',
	};
	return styles[dueDateUrgency.value] || 'text-muted-foreground bg-muted/40';
});

const commentsCount = computed(() => {
	if (typeof props.element.comments === 'number') return props.element.comments;
	if (Array.isArray(props.element.comments)) return props.element.comments.length;
	return 0;
});

const tasksCount = computed(() => {
	if (typeof props.element.tasks === 'number') return props.element.tasks;
	if (Array.isArray(props.element.tasks)) return props.element.tasks.length;
	return 0;
});

const assignedUsers = computed(() => {
	return props.element?.assigned_to?.map((assignment) => assignment.directus_users_id) || [];
});

const progress = computed(() => {
	if (typeof props.element.tasks === 'number') return 0;
	if (!props.element.tasks || !Array.isArray(props.element.tasks) || props.element.tasks.length === 0) return 0;
	const completedTasks = props.element.tasks.filter((task) => task && task.status === 'completed').length;
	return Math.round((completedTasks / props.element.tasks.length) * 100);
});

const MAX_DISPLAYED_USERS = 3;

const displayUsers = computed(() => {
	return [...assignedUsers.value]
		.sort((a, b) => {
			if (isCurrentUser(a)) return -1;
			if (isCurrentUser(b)) return 1;
			return 0;
		})
		.slice(0, MAX_DISPLAYED_USERS);
});

const additionalUsersCount = computed(() => {
	return Math.max(0, assignedUsers.value.length - MAX_DISPLAYED_USERS);
});

const getAdditionalUsersTooltip = computed(() => {
	const additionalUsers = assignedUsers.value
		.slice(MAX_DISPLAYED_USERS)
		.map((user) => getUserFullName(user))
		.join(', ');
	return `Also assigned: ${additionalUsers}`;
});

const isCurrentUser = (assignedUser) => {
	return assignedUser?.id === user?.value?.id;
};

const getPriorityColor = (priority) => {
	const colors = { low: 'gray', medium: 'blue', high: 'red', urgent: 'red' };
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

	const created = formatDateWithTime(props.element.date_created);
	const updated = formatDateWithTime(props.element.date_updated);

	const person = creator === updater ? `Created by: ${creator}` : `Updated by: ${updater}`;
	const time = creator === updater ? `Created on: ${created}` : `Updated on: ${updated}`;

	return `${person} <br/> ${time}`;
});
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ticket-card {
	background: hsl(var(--card));
	border: 1px solid hsl(var(--border) / 0.5);
	border-radius: 16px;
	transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.ticket-card:hover {
	border-color: hsl(var(--border));
	box-shadow: 0 2px 12px hsl(var(--foreground) / 0.04);
}
</style>
