<script setup lang="ts">
import type { ProjectWithRelations, ProjectEventWithRelations } from '~~/shared/projects';

const props = defineProps<{
  event: ProjectEventWithRelations;
  project: ProjectWithRelations;
}>();

const emit = defineEmits<{
  close: [];
  updated: [];
  deleted: [];
  'status-change': [status: string];
}>();

const config = useRuntimeConfig();
const { updateEvent } = useProjectTimeline();
const { getPriorityBadgeClass } = useStatusStyle();
const toast = useToast();

// Local editable copy
const form = reactive({
  title: '',
  description: '',
  event_date: '',
  end_date: '',
  type: '' as string,
  priority: '' as string,
  is_milestone: false,
  link: '',
  prototype_link: '',
});

// Sync from prop on load / change
watchEffect(() => {
  if (!props.event) return;
  form.title = props.event.title || '';
  form.description = props.event.description || '';
  form.event_date = props.event.event_date || props.event.date || '';
  form.end_date = props.event.end_date || props.event.event_date || props.event.date || '';
  form.type = props.event.type || 'General';
  form.priority = props.event.priority || 'Normal';
  form.is_milestone = Boolean(props.event.is_milestone);
  form.link = (props.event as any).link || '';
  form.prototype_link = (props.event as any).prototype_link || '';
});

// Conditional field visibility based on type
const visibleFields = computed(() => {
  const t = form.type;
  return {
    showLink: ['General', 'Design', 'Content'].includes(t),
    showPrototypeLink: t === 'Design',
    showFiles: ['Design', 'Content'].includes(t),
    showApproval: ['Design', 'Content'].includes(t),
  };
});

const dirty = computed(() => {
  if (!props.event) return false;
  return (
    form.title !== (props.event.title || '') ||
    form.description !== (props.event.description || '') ||
    form.event_date !== (props.event.event_date || props.event.date || '') ||
    form.end_date !== (props.event.end_date || props.event.event_date || props.event.date || '') ||
    form.type !== (props.event.type || 'General') ||
    form.priority !== (props.event.priority || 'Normal') ||
    form.is_milestone !== Boolean(props.event.is_milestone) ||
    form.link !== ((props.event as any).link || '') ||
    form.prototype_link !== ((props.event as any).prototype_link || '')
  );
});

const saving = ref(false);

async function save() {
  if (!dirty.value || saving.value) return;
  saving.value = true;
  try {
    await updateEvent(props.event.id, {
      title: form.title,
      description: form.description,
      event_date: form.event_date,
      end_date: form.end_date,
      date: form.event_date,
      type: form.type as any,
      priority: form.priority as any,
      is_milestone: form.is_milestone,
      link: form.link || null,
      prototype_link: form.prototype_link || null,
    });
    toast.add({ title: 'Event updated', color: 'green' });
    emit('updated');
  } catch (err: any) {
    toast.add({ title: 'Failed to save', description: err?.message, color: 'red' });
  } finally {
    saving.value = false;
  }
}

const taskStats = computed(() => {
  const tasks = props.event.tasks || [];
  const total = tasks.length;
  const completed = tasks.filter((t: any) => t.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
});

const fileCount = computed(() => props.event.files?.length || 0);

const typeOptions = ['General', 'Design', 'Content', 'Timeline', 'Hours'];
const priorityOptions = ['Normal', 'Urgent'];

defineExpose({ dirty, save });
</script>

<template>
  <div class="event-detail space-y-4 py-2">
    <!-- Editable fields card -->
    <div class="ios-card p-4 space-y-3">
      <!-- Title -->
      <input
        v-model="form.title"
        class="w-full text-base font-semibold bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground/50"
        placeholder="Event title..."
      />

      <!-- Date range row -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1.5">
          <Icon name="lucide:calendar" class="w-3.5 h-3.5 text-muted-foreground" />
          <input
            v-model="form.event_date"
            type="date"
            class="text-xs bg-transparent border rounded-full px-2.5 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <Icon name="lucide:arrow-right" class="w-3 h-3 text-muted-foreground/50" />
        <input
          v-model="form.end_date"
          type="date"
          class="text-xs bg-transparent border rounded-full px-2.5 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      <!-- Type, Priority, Milestone row -->
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="form.type"
          class="rounded-full border bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
        </select>

        <select
          v-model="form.priority"
          class="rounded-full border bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option v-for="p in priorityOptions" :key="p" :value="p">{{ p }}</option>
        </select>

        <button
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors"
          :class="form.is_milestone
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground hover:text-foreground hover:border-foreground/30'"
          @click="form.is_milestone = !form.is_milestone"
        >
          <Icon name="lucide:diamond" class="w-3 h-3" />
          Milestone
        </button>

        <!-- Category badge (read-only) -->
        <span
          v-if="typeof event.category_id === 'object' && event.category_id"
          class="rounded-full px-2.5 py-1 text-[9px] uppercase tracking-wider font-semibold"
          :style="{
            backgroundColor: event.category_id.color,
            color: event.category_id.text_color,
          }"
        >
          {{ event.category_id.name }}
        </span>
      </div>

      <!-- Description -->
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Description</label>
        <textarea
          v-model="form.description"
          rows="2"
          class="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          placeholder="Add a description..."
        />
      </div>

      <!-- Link (General, Design, Content) -->
      <div v-if="visibleFields.showLink" class="space-y-1">
        <label class="t-label text-muted-foreground">Link</label>
        <div class="flex items-center gap-2">
          <Icon name="lucide:link" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            v-model="form.link"
            type="url"
            class="w-full rounded-xl border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            placeholder="https://..."
          />
        </div>
      </div>

      <!-- Prototype Link (Design only) -->
      <div v-if="visibleFields.showPrototypeLink" class="space-y-1">
        <label class="t-label text-muted-foreground">Prototype / Figma</label>
        <div class="flex items-center gap-2">
          <Icon name="lucide:figma" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            v-model="form.prototype_link"
            type="url"
            class="w-full rounded-xl border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            placeholder="https://figma.com/..."
          />
        </div>
      </div>

      <!-- Approval Status (Design, Content) -->
      <div v-if="visibleFields.showApproval && ((event as any).approved_by || (event as any).approved_at)" class="flex items-center gap-2">
        <Icon name="lucide:check-circle-2" class="w-3.5 h-3.5 text-green-500" />
        <span class="text-xs text-muted-foreground">
          Approved
          <template v-if="(event as any).approved_by">
            by {{ (event as any).approved_by.first_name }} {{ (event as any).approved_by.last_name }}
          </template>
          <template v-if="(event as any).approved_at">
            on {{ new Date((event as any).approved_at).toLocaleDateString() }}
          </template>
        </span>
      </div>

      <!-- Reactions -->
      <ReactionsBar
        :item-id="String(event.id)"
        collection="project_events"
      />
    </div>

    <!-- Task progress -->
    <div v-if="taskStats.total > 0" class="ios-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="t-label text-muted-foreground">Tasks</h4>
        <span class="text-[10px] font-medium text-muted-foreground tabular-nums">
          {{ taskStats.completed }}/{{ taskStats.total }} ({{ taskStats.percent }}%)
        </span>
      </div>
      <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-500"
          :style="{
            width: taskStats.percent + '%',
            backgroundColor: project.color || project.service?.color,
          }"
        />
      </div>
      <ProjectTimelineTaskList
        :tasks="(event.tasks as any[]) || []"
        :project-color="project.color || project.service?.color || '#888'"
        @updated="emit('updated')"
      />
    </div>

    <!-- Files (Design, Content, Financial — or any type if files exist) -->
    <div v-if="fileCount > 0 || visibleFields.showFiles" class="ios-card p-4">
      <h4 class="t-label text-muted-foreground mb-3">
        Files{{ fileCount > 0 ? ` (${fileCount})` : '' }}
      </h4>
      <ProjectTimelineFileList v-if="fileCount > 0" :files="event.files || []" />
      <p v-else class="text-xs text-muted-foreground">No files attached.</p>
    </div>

    <!-- Discussion -->
    <div class="pt-3 border-t border-border">
      <h4 class="t-label text-muted-foreground mb-3">Discussion</h4>
      <CommentsSystem
        collection="project_events"
        :item-id="String(event.id)"
        hide-sort
      />
    </div>
  </div>
</template>
