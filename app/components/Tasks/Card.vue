<template>
	<div
		class="ios-card p-4 cursor-pointer transition-all"
		@click="$emit('select')"
	>
		<div class="flex items-start gap-2">
			<!-- Inline-complete affordance (left of the title); dual-purpose with
			     the status accent — checked = "done" status accent (green),
			     unchecked shows the task's actual status accent. -->
			<button class="shrink-0 mt-0.5" @click.stop="$emit('toggle-complete')">
				<div
					class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
					:class="task.completed
						? 'bg-primary border-primary'
						: 'border-border hover:border-primary'"
					:title="task.completed ? 'Mark incomplete' : 'Mark complete'"
				>
					<UIcon v-if="task.completed" name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
				</div>
			</button>

			<div class="flex-1 min-w-0">
				<p
					class="text-xs font-medium leading-snug line-clamp-2"
					:class="task.completed ? 'line-through text-muted-foreground' : 'text-foreground'"
				>
					{{ task.title }}
				</p>

				<!-- Meta row: priority + due date -->
				<div class="flex items-center gap-2 mt-1.5 flex-wrap">
					<span
						v-if="task.priority && task.priority !== 'medium'"
						class="text-[8px] uppercase font-bold tracking-wider"
						:class="priorityIconClass"
					>
						{{ task.priority }}
					</span>
					<span
						v-if="task.due_date && !task.completed"
						class="text-[10px] flex items-center gap-0.5"
						:class="dueDateTextClass"
					>
						<UIcon
							v-if="dueDateUrgency === 'past' || dueDateUrgency === 'urgent'"
							name="i-heroicons-exclamation-triangle"
							class="w-2.5 h-2.5"
						/>
						<UIcon v-else name="i-heroicons-calendar" class="w-2.5 h-2.5" />
						{{ formatDueDate(task.due_date) }}
					</span>
				</div>
			</div>

			<!-- Assignee avatar -->
			<div v-if="assignee" class="shrink-0">
				<UTooltip :text="assigneeName">
					<UAvatar
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
				</UTooltip>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
type TeamMember = { id: string; first_name: string; last_name: string; avatar?: string };

const props = defineProps<{
	task: any;
	teamMembers?: TeamMember[];
}>();

defineEmits<{
	select: [];
	'toggle-complete': [];
}>();

const { getPriorityIconClass } = useStatusStyle();
const config = useRuntimeConfig();

const priorityIconClass = computed(() => getPriorityIconClass(props.task?.priority));

const dueDateUrgency = computed(() => formatDueDateStatus(props.task?.due_date));

const dueDateTextClass = computed(() => {
	const u = dueDateUrgency.value;
	if (u === 'past') return 'text-red-500';
	if (u === 'urgent') return 'text-orange-500';
	if (u === 'medium') return 'text-yellow-600';
	return 'text-muted-foreground';
});

const assignee = computed<TeamMember | undefined>(() => {
	const id = props.task?.assignee_id;
	if (!id) return undefined;
	return props.teamMembers?.find(m => m.id === id);
});

const assigneeName = computed(() => {
	const a = assignee.value;
	return a ? `${a.first_name} ${a.last_name}`.trim() : '';
});

const assigneeInitial = computed(() => assignee.value?.first_name?.[0]?.toUpperCase() || '?');

const assigneeAvatar = computed(() => {
	const a = assignee.value;
	if (!a?.avatar) return null;
	return `${config.public.directusUrl}/assets/${a.avatar}?key=small`;
});
</script>
