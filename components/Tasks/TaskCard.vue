<script setup>
import { ref, computed } from 'vue';
import { useRealtimeSubscription } from './composables/useRealtimeSubscription';

const props = defineProps({
	ticket: {
		type: Object,
		required: true,
	},
});

// Get comments count using realtime subscription
const { data: comments } = useRealtimeSubscription(
	'tickets_comments',
	['id'],
	{
		tickets_id: {
			_eq: props.ticket.id,
		},
	},
	'-date_created',
);

const commentsCount = computed(() => comments.value.length);

const isExpanded = ref(false);

const assigneeAvatars = computed(() => {
	return (
		props.ticket.assigned_to?.map((user) => ({
			src: user.avatar
				? `${useRuntimeConfig().public.apiBase}/assets/${user.avatar}?key=small`
				: `https://ui-avatars.com/api/?name=${user.first_name}+${user.last_name}`,
			alt: `${user.first_name} ${user.last_name}`,
		})) || []
	);
});

const dueDate = computed(() => {
	if (!props.ticket.due_date) return null;

	const date = new Date(props.ticket.due_date);
	const today = new Date();
	const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

	return {
		formatted: date.toLocaleDateString(),
		isOverdue: diffDays < 0,
		daysLeft: Math.abs(diffDays),
	};
});
</script>

<template>
	<div
		class="task-card bg-white rounded-lg shadow-sm p-4 cursor-move hover:shadow-md transition-shadow"
		:class="{ 'is-expanded': isExpanded }"
	>
		<div class="flex justify-between items-start mb-2">
			<NuxtLink :to="`/tickets/${ticket.id}`" class="text-lg font-medium hover:text-primary-500">
				{{ ticket.title }}
			</NuxtLink>
			<UButton
				icon="i-heroicons-chevron-down"
				color="gray"
				variant="ghost"
				size="xs"
				:class="{ 'rotate-180': isExpanded }"
				@click="isExpanded = !isExpanded"
			/>
		</div>

		<p class="text-gray-600 text-sm mb-3 line-clamp-2">
			{{ ticket.description }}
		</p>

		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<UAvatarGroup size="xs" :max="3" :avatars="assigneeAvatars" />

				<UTooltip v-if="dueDate" :text="dueDate.formatted">
					<UBadge :color="dueDate.isOverdue ? 'red' : 'gray'" size="sm">
						{{ dueDate.isOverdue ? `${dueDate.daysLeft}d overdue` : `${dueDate.daysLeft}d left` }}
					</UBadge>
				</UTooltip>
			</div>

			<div class="flex items-center space-x-2">
				<UTooltip text="Comments">
					<UBadge v-if="commentsCount > 0" color="gray" size="sm" class="flex items-center space-x-1">
						<Icon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4" />
						<span>{{ commentsCount }}</span>
					</UBadge>
				</UTooltip>
			</div>
		</div>

		<Transition name="expand">
			<div v-if="isExpanded" class="mt-4 pt-4 border-t">
				<CommentsContainer :parent-id="ticket.id" collection="tickets" />
			</div>
		</Transition>
	</div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
	transition: all 0.3s ease-out;
	max-height: 1000px;
	opacity: 1;
}

.expand-enter-from,
.expand-leave-to {
	max-height: 0;
	opacity: 0;
	overflow: hidden;
}
</style>
