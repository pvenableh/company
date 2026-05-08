<template>
	<div class="w-full mb-2 group ios-press">
		<div
			class="ios-card p-4 cursor-pointer transition-all relative"
			@click="$emit('edit', element)"
		>
			<!-- Top row: status dot + title + assignee stack -->
			<div class="flex items-start gap-2">
				<span
					class="shrink-0 mt-1 w-2 h-2 rounded-full"
					:style="{ backgroundColor: statusAccent }"
					:title="element?.status"
				/>

				<div class="flex-1 min-w-0">
					<p
						class="text-xs font-medium leading-snug line-clamp-2"
						:class="element?.status === 'Completed' ? 'text-muted-foreground line-through' : 'text-foreground'"
					>
						{{ element?.title }}
					</p>

					<!-- Meta row: priority + due date + client + team -->
					<div class="flex items-center gap-2 mt-1.5 flex-wrap">
						<span
							v-if="element?.priority && element.priority !== 'medium'"
							class="text-[8px] uppercase font-bold tracking-wider"
							:class="priorityTextClass"
						>
							{{ element.priority }}
						</span>
						<span
							v-if="element?.due_date && element?.status !== 'Completed'"
							class="text-[10px] flex items-center gap-0.5"
							:class="dueDateTextClass"
						>
							<UIcon
								v-if="dueDateUrgency === 'past' || dueDateUrgency === 'urgent'"
								name="i-heroicons-exclamation-triangle"
								class="w-2.5 h-2.5"
							/>
							<UIcon v-else name="i-heroicons-calendar" class="w-2.5 h-2.5" />
							{{ formatDueDate(element.due_date) }}
						</span>
						<span
							v-else-if="element?.status === 'Completed'"
							class="text-[10px] text-muted-foreground"
						>
							{{ getFriendlyDate(element?.date_updated) }}
						</span>
						<span
							v-if="clientLabel"
							class="text-[10px] text-muted-foreground truncate max-w-[120px]"
						>
							{{ clientLabel }}
						</span>
						<span
							v-if="element?.team?.name"
							class="text-[10px] text-muted-foreground flex items-center gap-0.5"
						>
							<UIcon name="i-heroicons-user-group" class="w-2.5 h-2.5" />
							{{ element.team.name }}
						</span>
					</div>
				</div>

				<!-- Assignees -->
				<div v-if="assignedUsers.length" class="shrink-0 flex -space-x-1">
					<UTooltip
						v-for="(u, i) in displayUsers"
						:key="i"
						:text="getUserFullName(u)"
					>
						<UAvatar
							:src="getAvatarUrl(u)"
							:alt="getUserFullName(u)"
							size="2xs"
							:class="{ 'ring-1 ring-primary/40': isCurrentUser(u) }"
						/>
					</UTooltip>
					<UTooltip
						v-if="additionalUsersCount > 0"
						:text="getAdditionalUsersTooltip"
					>
						<div
							class="flex items-center justify-center w-5 h-5 text-[8px] font-semibold text-muted-foreground bg-muted/60 rounded-full border border-card"
						>
							+{{ additionalUsersCount }}
						</div>
					</UTooltip>
				</div>
			</div>

			<!-- Slim progress bar (only when there are tasks) -->
			<div v-if="progress > 0" class="mt-3 h-0.5 bg-muted/40 rounded-full overflow-hidden">
				<div
					class="h-full transition-all duration-500"
					:class="progress >= 90 ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : progress >= 25 ? 'bg-amber-500' : 'bg-red-500'"
					:style="{ width: progress + '%' }"
				/>
			</div>

			<!-- Footer: reactions + counts -->
			<div v-if="hasFooter" class="flex items-center justify-between mt-3">
				<ReactionsBar :item-id="element.id" collection="tickets" />
				<div class="flex items-center gap-2.5 text-[10px] text-muted-foreground">
					<UTooltip
						v-if="commentsCount > 0"
						:text="commentsCount + (commentsCount === 1 ? ' Comment' : ' Comments')"
					>
						<span class="flex items-center gap-0.5">
							<UIcon name="i-heroicons-chat-bubble-left-right" class="w-2.5 h-2.5" />
							{{ commentsCount }}
						</span>
					</UTooltip>
					<UTooltip v-if="tasksCount > 0" :text="tasksCount + ' tasks'">
						<span class="flex items-center gap-0.5">
							<UIcon name="i-heroicons-check-circle" class="w-2.5 h-2.5" />
							{{ tasksCount }}
						</span>
					</UTooltip>
				</div>
			</div>

			<!-- Hover archive button -->
			<button
				class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted/40"
				:title="'Archive'"
				@click.stop="$emit('archive', element?.id)"
			>
				<UIcon name="i-heroicons-archive-box-arrow-down" class="w-3 h-3 text-muted-foreground" />
			</button>
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

defineEmits(['archive', 'edit']);

const { user } = useDirectusAuth();
const { getStatusAccent } = useStatusStyle();

const statusAccent = computed(() => getStatusAccent(props.element?.status));

const priorityTextClass = computed(() => {
	const p = props.element?.priority;
	if (p === 'urgent') return 'text-red-500';
	if (p === 'high') return 'text-orange-500';
	if (p === 'low') return 'text-muted-foreground';
	return 'text-muted-foreground';
});

const dueDateUrgency = computed(() => formatDueDateStatus(props.element?.due_date));

const dueDateTextClass = computed(() => {
	const u = dueDateUrgency.value;
	if (u === 'past') return 'text-red-500';
	if (u === 'urgent') return 'text-orange-500';
	if (u === 'medium') return 'text-yellow-600';
	return 'text-muted-foreground';
});

const clientLabel = computed(
	() => props.element?.client?.name || props.element?.organization?.name || '',
);

const commentsCount = computed(() => {
	const c = props.element?.comments;
	if (typeof c === 'number') return c;
	if (Array.isArray(c)) return c.length;
	return 0;
});

const tasksCount = computed(() => {
	const t = props.element?.tasks;
	if (typeof t === 'number') return t;
	if (Array.isArray(t)) return t.length;
	return 0;
});

const hasFooter = computed(() => commentsCount.value > 0 || tasksCount.value > 0);

const assignedUsers = computed(
	() => props.element?.assigned_to?.map((a) => a.directus_users_id) || [],
);

const progress = computed(() => {
	const t = props.element?.tasks;
	if (!Array.isArray(t) || t.length === 0) return 0;
	const completed = t.filter((task) => task && task.status === 'completed').length;
	return Math.round((completed / t.length) * 100);
});

const MAX_DISPLAYED_USERS = 3;

const displayUsers = computed(() =>
	[...assignedUsers.value]
		.sort((a, b) => {
			if (isCurrentUser(a)) return -1;
			if (isCurrentUser(b)) return 1;
			return 0;
		})
		.slice(0, MAX_DISPLAYED_USERS),
);

const additionalUsersCount = computed(() =>
	Math.max(0, assignedUsers.value.length - MAX_DISPLAYED_USERS),
);

const getAdditionalUsersTooltip = computed(() => {
	const additional = assignedUsers.value
		.slice(MAX_DISPLAYED_USERS)
		.map((u) => getUserFullName(u))
		.join(', ');
	return `Also assigned: ${additional}`;
});

const isCurrentUser = (assigned) => assigned?.id === user?.value?.id;

const getAvatarUrl = (u) => {
	if (!u?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${u.avatar}?key=small`;
};

const getUserFullName = (assigned) => {
	if (!assigned) return 'Unknown';
	if (assigned.id === user.value?.id) return 'You';
	return `${assigned.first_name} ${assigned.last_name}`.trim();
};
</script>
