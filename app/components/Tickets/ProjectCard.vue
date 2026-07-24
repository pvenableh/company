<!--
  TicketsProjectCard — ticket card for the project-scoped TicketsProjectBoard.
  Shares the tasks board's card chrome (ios-card, priority + due meta,
  assignee avatar) but is ticket-specific: NO done checkbox (status is driven
  by drag-and-drop between columns), and a footer that surfaces the ticket's
  richer content — its task checklist progress and comment count.
-->
<template>
	<div
		class="ios-card p-4 cursor-pointer transition-all"
		@click="$emit('select', $event)"
	>
		<div class="flex items-start gap-2">
			<div class="flex-1 min-w-0">
				<p class="text-xs font-medium leading-snug line-clamp-2 text-foreground">
					{{ ticket.title }}
				</p>

				<!-- Meta row: priority + due date -->
				<div class="flex items-center gap-2 mt-1.5 flex-wrap">
					<span
						v-if="ticket.priority && ticket.priority !== 'medium'"
						class="text-[10px] uppercase font-bold tracking-wider"
						:class="priorityIconClass"
					>
						{{ ticket.priority }}
					</span>
					<span
						v-if="ticket.due_date"
						class="text-[10px] flex items-center gap-0.5"
						:class="dueDateTextClass"
					>
						<EIcon
							v-if="dueDateUrgency === 'past' || dueDateUrgency === 'urgent'"
							name="i-heroicons-exclamation-triangle"
							class="w-2.5 h-2.5"
						/>
						<EIcon v-else name="i-heroicons-calendar" class="w-2.5 h-2.5" />
						{{ formatDueDate(ticket.due_date) }}
					</span>
				</div>
			</div>

			<!-- Assignee avatar -->
			<div v-if="assignee" class="shrink-0">
				<ETooltip :text="assigneeName">
					<EAvatar
						v-if="assigneeAvatar"
						:src="assigneeAvatar"
						:alt="assigneeName"
						size="2xs"
					/>
					<div
						v-else
						class="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center text-[8px] font-semibold text-muted-foreground"
					>
						{{ assigneeInitial }}
					</div>
				</ETooltip>
			</div>
		</div>

		<!-- Ticket detail footer — task checklist progress + comment count.
		     These are what make a ticket richer than a task; the full
		     checklist + comment thread live in the ticket slide-over. -->
		<div
			v-if="taskTotal || commentCount"
			class="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border/40 text-[10px] text-muted-foreground"
		>
			<span v-if="taskTotal" class="inline-flex items-center gap-1" :title="`${taskDone} of ${taskTotal} tasks done`">
				<EIcon name="i-heroicons-check-circle" class="w-3 h-3" :class="taskDone === taskTotal ? 'text-success' : ''" />
				{{ taskDone }}/{{ taskTotal }}
			</span>
			<span v-if="commentCount" class="inline-flex items-center gap-1" :title="`${commentCount} comments`">
				<EIcon name="i-heroicons-chat-bubble-left" class="w-3 h-3" />
				{{ commentCount }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	ticket: any;
}>();

defineEmits<{
	select: [event: MouseEvent];
}>();

const { getPriorityIconClass } = useStatusStyle();
const config = useRuntimeConfig();

const priorityIconClass = computed(() => getPriorityIconClass(props.ticket?.priority));

const dueDateUrgency = computed(() => formatDueDateStatus(props.ticket?.due_date));

const dueDateTextClass = computed(() => {
	const u = dueDateUrgency.value;
	if (u === 'past') return 'text-destructive';
	if (u === 'urgent') return 'text-warning';
	if (u === 'medium') return 'text-warning';
	return 'text-muted-foreground';
});

// Task checklist progress (tickets own a `tasks` relation; tasks.status is the
// lowercase task enum, so 'completed' = done).
const taskTotal = computed(() => (Array.isArray(props.ticket?.tasks) ? props.ticket.tasks.length : 0));
const taskDone = computed(() =>
	Array.isArray(props.ticket?.tasks)
		? props.ticket.tasks.filter((t: any) => (typeof t === 'object' ? t?.status : null) === 'completed').length
		: 0,
);

const commentCount = computed(() => Number(props.ticket?.commentsCount) || 0);

// tickets.assigned_to is an m2m junction array (tickets_directus_users →
// directus_users_id). First assignee wins for the avatar.
const assignee = computed(() => {
	const junction = props.ticket?.assigned_to?.[0];
	const u = typeof junction === 'string' ? null : junction?.directus_users_id;
	if (!u || typeof u === 'string') return undefined;
	return u;
});

const assigneeName = computed(() => {
	const a = assignee.value;
	return a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : '';
});

const assigneeInitial = computed(() => assignee.value?.first_name?.[0]?.toUpperCase() || '?');

const assigneeAvatar = computed(() => {
	const a = assignee.value;
	if (!a?.avatar) return null;
	return `${config.public.directusUrl}/assets/${a.avatar}?key=small`;
});
</script>
