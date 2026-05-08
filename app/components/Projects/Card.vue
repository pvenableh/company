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

const { user } = useDirectusAuth();
const { getStatusAccent } = useStatusStyle();

const statusAccent = computed(() => getStatusAccent(props.project?.status));

const assignedUsers = computed(
	() => props.project?.assigned_to?.map((a) => a.directus_users_id) || [],
);

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

const eventCount = computed(() => props.project?.events?.length || 0);
const ticketCount = computed(() => props.project?.tickets?.length || 0);
const commentCount = computed(() => {
	const c = props.project?.commentsCount;
	if (typeof c === 'number') return c;
	if (Array.isArray(props.project?.comments)) return props.project.comments.length;
	return 0;
});
const hasCounts = computed(
	() => eventCount.value > 0 || ticketCount.value > 0 || commentCount.value > 0,
);

// Client first, fall back to organization for internal projects.
const clientLabel = computed(
	() => props.project?.client?.name || props.project?.organization?.name || '',
);
</script>

<template>
	<nuxt-link
		:to="`/projects/${project.id}`"
		class="block w-full mb-2 transition-all project-card"
	>
		<div class="ios-card p-4 cursor-pointer transition-all">
			<!-- Top row: status dot + title + assignees -->
			<div class="flex items-start gap-2">
				<span
					class="shrink-0 mt-1 w-2 h-2 rounded-full"
					:style="{ backgroundColor: statusAccent }"
					:title="project?.status"
				/>

				<div class="flex-1 min-w-0">
					<p class="text-xs font-medium text-foreground leading-snug line-clamp-2">
						{{ project?.title }}
					</p>

					<!-- Meta row: service + client (fallback org) -->
					<div class="flex items-center gap-2 mt-1.5 flex-wrap">
						<span
							v-if="project?.service?.name"
							class="text-[8px] uppercase font-bold tracking-wider flex items-center gap-1"
							:style="{ color: project?.service?.color || 'var(--muted-foreground)' }"
						>
							<span
								class="w-1.5 h-1.5 rounded-full"
								:style="{ backgroundColor: project?.service?.color || 'var(--muted-foreground)' }"
							/>
							{{ project.service.name }}
						</span>
						<span
							v-if="clientLabel"
							class="text-[10px] text-muted-foreground truncate max-w-[140px]"
						>
							{{ clientLabel }}
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

			<!-- Footer: event/ticket/comment counts -->
			<div
				v-if="hasCounts"
				class="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground"
			>
				<UTooltip v-if="eventCount > 0" :text="eventCount + ' events'">
					<span class="flex items-center gap-0.5">
						<UIcon name="i-heroicons-clock" class="w-2.5 h-2.5" />
						{{ eventCount }}
					</span>
				</UTooltip>
				<UTooltip v-if="ticketCount > 0" :text="ticketCount + ' tickets'">
					<span class="flex items-center gap-0.5">
						<UIcon name="i-heroicons-square-3-stack-3d" class="w-2.5 h-2.5" />
						{{ ticketCount }}
					</span>
				</UTooltip>
				<UTooltip
					v-if="commentCount > 0"
					:text="commentCount + (commentCount === 1 ? ' Comment' : ' Comments')"
				>
					<span class="flex items-center gap-0.5">
						<UIcon name="i-heroicons-chat-bubble-left-right" class="w-2.5 h-2.5" />
						{{ commentCount }}
					</span>
				</UTooltip>
			</div>
		</div>
	</nuxt-link>
</template>
