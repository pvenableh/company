<script setup lang="ts">
import type { ProjectTaskWithRelations } from '~~/shared/projects';
import { Checkbox } from '~/components/ui/checkbox';

const props = defineProps<{
  tasks: ProjectTaskWithRelations[];
  projectColor: string;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const { toggleTask } = useProjectTimeline();
const { celebrate } = useConfetti();
const config = useRuntimeConfig();

const sortedTasks = computed(() => {
  return [...props.tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.priority && b.priority) {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    }
    return 0;
  });
});

async function handleToggle(taskId: string, completed: boolean) {
  await toggleTask(taskId, completed);
  if (completed) {
    await celebrate();
  }
  emit('updated');
}

function getPriorityClasses(priority: string | null) {
  switch (priority) {
    case 'high': return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'medium': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'low': return 'bg-blue-500/10 text-blue-400 border-blue-400/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

// Uses formatDueDateDetail from utils/dates.ts
function formatDueDate(dateStr: string | null) {
  return formatDueDateDetail(dateStr);
}
</script>

<template>
  <div class="space-y-1">
    <div
      v-for="task in sortedTasks"
      :key="task.id"
      class="flex items-start gap-2.5 p-2 rounded-xl hover:bg-muted/50 transition-colors group"
      :class="{ 'opacity-50': task.completed }"
    >
      <!-- Checkbox -->
      <Checkbox
        :checked="task.completed"
        class="mt-0.5"
        @update:checked="(val: boolean) => handleToggle(task.id, val)"
      />

      <!-- Task content -->
      <div class="flex-1 min-w-0">
        <p
          class="text-sm leading-tight"
          :class="{ 'line-through text-muted-foreground': task.completed }"
        >
          {{ task.title }}
        </p>

        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
          <!-- Priority pill -->
          <span
            v-if="task.priority"
            class="inline-flex items-center rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-wider font-bold"
            :class="getPriorityClasses(task.priority)"
          >
            {{ task.priority }}
          </span>

          <!-- Due date -->
          <span
            v-if="task.due_date && !task.completed"
            class="text-[9px]"
            :class="formatDueDate(task.due_date)?.class"
          >
            {{ formatDueDate(task.due_date)?.text }}
          </span>

          <!-- Assignee -->
          <div v-if="task.assignee_id && typeof task.assignee_id === 'object'" class="flex items-center gap-1">
            <UserAvatar class="h-4 w-4">
              <AvatarImage
                v-if="task.assignee_id.avatar"
                :src="`${config.public.directusUrl}/assets/${task.assignee_id.avatar}`"
                :alt="task.assignee_id.first_name"
              />
              <AvatarFallback class="text-[6px]">
                {{ (task.assignee_id.first_name?.[0] || '') + (task.assignee_id.last_name?.[0] || '') }}
              </AvatarFallback>
            </UserAvatar>
            <span class="text-[9px] text-muted-foreground">
              {{ task.assignee_id.first_name }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
