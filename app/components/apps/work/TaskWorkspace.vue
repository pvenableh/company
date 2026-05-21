<!--
  TaskWorkspace — shared body for the task detail surface.

  Mounted by `panels/TaskPanel.vue` (slide-over). Tasks have no
  per-id route today, so the slide-over IS the canonical detail
  surface; the workspace stays a separate component for symmetry
  with the other P3 entities and so a future `/tasks/[id]` route
  (or apps-tasks page) can mount the same body cheaply.

  Inline editors mirror the legacy `<TasksDetailPanel>` body
  (title, status, priority, assignee, due date, description) and
  notify the entity bus on save so list views repaint.
-->
<script setup lang="ts">
import { notifyEntityChange } from '~/composables/useEntityStore';

const props = defineProps<{
  taskId: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loaded', task: any): void;
  (e: 'back'): void;
  (e: 'deleted', id: string): void;
}>();

const { push: pushPanel } = useAppSlideOverStack();
const toast = useToast();
const taskItems = useDirectusItems('tasks');
const userItems = useDirectusItems('directus_users');
const { getStatusBadgeClasses } = useStatusStyle();

const task = ref<any | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const saving = ref(false);
const teamMembers = ref<Array<{ id: string; first_name: string; last_name: string }>>([]);
const confirmingDelete = ref(false);
const deleting = ref(false);

const statusLabels: Record<string, string> = {
  new: 'To Do',
  approved: 'To Do',
  in_progress: 'In Progress',
  completed: 'Done',
};

const priorityOptions = [
  { value: 'low', label: 'Low', activeClass: 'bg-blue-500/10 text-blue-500' },
  { value: 'medium', label: 'Medium', activeClass: 'bg-warning/10 text-warning' },
  { value: 'high', label: 'High', activeClass: 'bg-destructive/10 text-destructive' },
];

const isCompleted = computed(() => task.value?.status === 'completed');

const assigneeId = computed<string>(() => {
  const junction = task.value?.assigned_to?.[0];
  if (!junction) return '';
  const id = typeof junction === 'string'
    ? junction
    : junction?.directus_users_id?.id || junction?.directus_users_id || '';
  return id || '';
});

const projectInfo = computed(() => {
  const p = task.value?.project_id;
  if (!p) return null;
  if (typeof p === 'string') return { id: p, title: 'Project' };
  return { id: p.id, title: p.title || 'Project' };
});

async function loadTask() {
  loading.value = true;
  error.value = null;
  try {
    task.value = await taskItems.get(props.taskId, {
      fields: [
        'id', 'title', 'description', 'status', 'priority', 'due_date',
        'date_completed', 'category', 'organization_id',
        'project_id.id', 'project_id.title',
        'assigned_to.directus_users_id.id',
        'assigned_to.directus_users_id.first_name',
        'assigned_to.directus_users_id.last_name',
      ],
    });
    if (task.value) emit('loaded', task.value);
  } catch (err: any) {
    error.value = err?.message || 'Failed to load task';
  } finally {
    loading.value = false;
  }
}

async function loadTeamMembers() {
  const orgId = task.value?.organization_id;
  if (!orgId) {
    teamMembers.value = [];
    return;
  }
  try {
    const rows = await userItems.list({
      fields: ['id', 'first_name', 'last_name'],
      filter: {
        organizations: { organizations_id: { _eq: typeof orgId === 'object' ? orgId.id : orgId } },
        status: { _eq: 'active' },
      },
      limit: 100,
      sort: ['first_name', 'last_name'],
    });
    teamMembers.value = (rows || []).filter((u: any) => u && u.id);
  } catch {
    teamMembers.value = [];
  }
}

watch(() => props.taskId, loadTask, { immediate: true });
watch(() => task.value?.organization_id, loadTeamMembers);

async function patchTask(payload: Record<string, any>) {
  if (!task.value || saving.value) return;
  saving.value = true;
  const previous = { ...task.value };
  Object.assign(task.value, payload);
  try {
    const updated = await taskItems.update(props.taskId, payload);
    if (updated) Object.assign(task.value, updated);
    notifyEntityChange('tasks', { id: props.taskId, op: 'update', item: task.value });
  } catch (err: any) {
    Object.assign(task.value, previous);
    toast.add({
      title: 'Could not save',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    saving.value = false;
  }
}

function saveField(field: string, value: any) {
  patchTask({ [field]: value });
}

function onStatusChange(newStatus: string) {
  if (!task.value) return;
  task.value.status = newStatus;
  patchTask({
    status: newStatus,
    date_completed: newStatus === 'completed' ? new Date().toISOString() : null,
  });
}

function onAssigneeChange(newId: string | null) {
  if (!task.value) return;
  const assigned_to = newId ? [{ directus_users_id: newId }] : [];
  patchTask({ assigned_to });
}

function toggleComplete() {
  const newStatus = isCompleted.value ? 'new' : 'completed';
  onStatusChange(newStatus);
}

async function deleteTask() {
  if (!task.value || deleting.value) return;
  deleting.value = true;
  try {
    await taskItems.remove(props.taskId);
    notifyEntityChange('tasks', { id: props.taskId, op: 'remove' });
    emit('deleted', props.taskId);
    emit('back');
    toast.add({ title: 'Task deleted', icon: 'i-lucide-check-circle', color: 'green' });
  } catch (err: any) {
    toast.add({
      title: 'Could not delete',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    deleting.value = false;
    confirmingDelete.value = false;
  }
}

function openProject() {
  if (!projectInfo.value?.id) return;
  if (props.compact) pushPanel('work-project', String(projectInfo.value.id));
  // allow-legacy-link — full-page mode keeps the classic project route
  else useRouter().push(`/projects/${projectInfo.value.id}`);
}
</script>

<template>
  <div :class="compact ? '' : 'max-w-2xl mx-auto p-4 sm:p-6'">
    <div v-if="loading" class="text-center py-12 text-sm text-muted-foreground">Loading…</div>
    <div v-else-if="error" class="ios-card p-8 text-center">
      <div class="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-3">
        <Icon name="lucide:alert-triangle" class="w-6 h-6 text-destructive" />
      </div>
      <p class="text-sm text-foreground">{{ error }}</p>
    </div>

    <template v-else-if="task">
      <!-- Header strip: check + status badge + delete -->
      <div class="flex items-center justify-between gap-2 mb-4">
        <div class="flex items-center gap-2">
          <button type="button" @click="toggleComplete" class="shrink-0">
            <div
              class="w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
              :class="isCompleted
                ? 'bg-primary border-primary'
                : 'border-border hover:border-primary'"
            >
              <Icon v-if="isCompleted" name="lucide:check" class="w-3 h-3 text-white" />
            </div>
          </button>
          <span
            class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            :class="getStatusBadgeClasses(task.status || 'new')"
          >
            {{ statusLabels[task.status || 'new'] }}
          </span>
        </div>
        <button
          type="button"
          class="p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete task"
          @click="confirmingDelete = true"
        >
          <Icon name="lucide:trash-2" class="w-4 h-4" />
        </button>
      </div>

      <!-- Title -->
      <div class="mb-5">
        <input
          v-model="task.title"
          class="w-full text-base font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/40"
          placeholder="Task title..."
          @blur="saveField('title', task.title)"
        />
      </div>

      <!-- Fields -->
      <div class="space-y-3 mb-5">
        <div class="flex items-center gap-3">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Status</span>
          <select
            v-model="task.status"
            class="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
            @change="onStatusChange(task.status)"
          >
            <option value="new">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Done</option>
          </select>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Priority</span>
          <div class="flex gap-1">
            <button
              v-for="p in priorityOptions"
              :key="p.value"
              type="button"
              class="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors"
              :class="task.priority === p.value ? p.activeClass : 'text-muted-foreground hover:bg-muted/40'"
              @click="task.priority = p.value; saveField('priority', p.value)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Assignee</span>
          <select
            :value="assigneeId"
            class="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
            @change="onAssigneeChange(($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">Unassigned</option>
            <option v-for="m in teamMembers" :key="m.id" :value="m.id">
              {{ m.first_name }} {{ m.last_name }}
            </option>
          </select>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Due Date</span>
          <input
            v-model="task.due_date"
            type="date"
            class="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
            @change="saveField('due_date', task.due_date || null)"
          />
        </div>

        <div v-if="projectInfo" class="flex items-center gap-3">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Project</span>
          <button
            type="button"
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            @click="openProject"
          >
            <Icon name="lucide:folder" class="w-3.5 h-3.5" />
            {{ projectInfo.title }}
          </button>
        </div>
      </div>

      <!-- Description -->
      <div class="mb-5">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Description</span>
        <textarea
          v-model="task.description"
          rows="4"
          class="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/40 resize-none"
          placeholder="Add details..."
          @blur="saveField('description', task.description || null)"
        />
      </div>

      <!-- Delete confirm -->
      <div v-if="confirmingDelete" class="px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 mb-5">
        <p class="text-sm text-destructive mb-3">Delete this task? This cannot be undone.</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground"
            :disabled="deleting"
            @click="confirmingDelete = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs bg-destructive text-white"
            :disabled="deleting"
            @click="deleteTask"
          >
            {{ deleting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
