<script setup lang="ts">
import type { TaskWithRelations } from '~~/shared/projects';
import { Checkbox } from '~/components/ui/checkbox';

const props = defineProps<{
  tasks: TaskWithRelations[];
  projectColor: string;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const { toggleTask } = useProjectTimeline();
const { celebrate } = useConfetti();
const config = useRuntimeConfig();

function isDone(task: any): boolean {
  return task?.status === 'completed';
}

function firstAssignee(task: any): any | null {
  // tasks.assigned_to is an m2m junction array of { directus_users_id }; the
  // deep-fetch shape may return either { directus_users_id: User } or just
  // the user id string. We surface the first assignee for legacy single-pick UX.
  const junction = task?.assigned_to?.[0];
  if (!junction) return null;
  const u = junction?.directus_users_id;
  return (u && typeof u === 'object') ? u : null;
}

const sortedTasks = computed(() => {
  return [...props.tasks].sort((a, b) => {
    const ad = isDone(a);
    const bd = isDone(b);
    if (ad !== bd) return ad ? 1 : -1;
    if (a.priority && b.priority) {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
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
    case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'medium': return 'bg-warning/10 text-warning border-warning/20';
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
      :class="{ 'opacity-50': isDone(task) }"
    >
      <!-- Checkbox -->
      <Checkbox
        :checked="isDone(task)"
        class="mt-0.5"
        @update:checked="(val: boolean) => handleToggle(task.id, val)"
      />

      <!-- Task content -->
      <div class="flex-1 min-w-0">
        <p
          class="text-sm leading-tight"
          :class="{ 'line-through text-muted-foreground': isDone(task) }"
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
            v-if="task.due_date && !isDone(task)"
            class="text-[9px]"
            :class="formatDueDate(task.due_date)?.class"
          >
            {{ formatDueDate(task.due_date)?.text }}
          </span>

          <!-- Assignee -->
          <div v-if="firstAssignee(task)" class="flex items-center gap-1">
            <UserAvatar class="h-4 w-4">
              <AvatarImage
                v-if="firstAssignee(task)?.avatar"
                :src="`${config.public.directusUrl}/assets/${firstAssignee(task).avatar}`"
                :alt="firstAssignee(task)?.first_name"
              />
              <AvatarFallback class="text-[6px]">
                {{ (firstAssignee(task)?.first_name?.[0] || '') + (firstAssignee(task)?.last_name?.[0] || '') }}
              </AvatarFallback>
            </UserAvatar>
            <span class="text-[9px] text-muted-foreground">
              {{ firstAssignee(task)?.first_name }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
