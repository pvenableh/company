<!--
  TicketsProjectCard — compact ticket card for the project-scoped
  TicketsProjectBoard. Mirrors TasksCard so the tickets board reads as the
  same surface as the tasks board (same chrome, same meta row, same avatar).
-->
<template>
	<div
		class="ios-card p-4 cursor-pointer transition-all"
		@click="$emit('select', $event)"
	>
		<div class="flex items-start gap-2">
			<!-- Inline-complete affordance — checked = Completed status. -->
			<button class="shrink-0 mt-0.5" @click.stop="$emit('toggle-complete')">
				<div
					class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
					:class="isCompleted
						? 'bg-primary border-primary'
						: 'border-border hover:border-primary'"
					:title="isCompleted ? 'Reopen ticket' : 'Mark completed'"
				>
					<EIcon v-if="isCompleted" name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
				</div>
			</button>

			<div class="flex-1 min-w-0">
				<p
					class="text-xs font-medium leading-snug line-clamp-2"
					:class="isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'"
				>
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
						v-if="ticket.due_date && !isCompleted"
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
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	ticket: any;
}>();

defineEmits<{
	select: [event: MouseEvent];
	'toggle-complete': [];
}>();

const { getPriorityIconClass } = useStatusStyle();
const config = useRuntimeConfig();

const isCompleted = computed(() => props.ticket?.status === 'Completed');

const priorityIconClass = computed(() => getPriorityIconClass(props.ticket?.priority));

const dueDateUrgency = computed(() => formatDueDateStatus(props.ticket?.due_date));

const dueDateTextClass = computed(() => {
	const u = dueDateUrgency.value;
	if (u === 'past') return 'text-destructive';
	if (u === 'urgent') return 'text-warning';
	if (u === 'medium') return 'text-warning';
	return 'text-muted-foreground';
});

// tickets.assigned_to is an m2m junction array (tickets_directus_users →
// directus_users_id). First assignee wins for the avatar, mirroring TasksCard.
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
