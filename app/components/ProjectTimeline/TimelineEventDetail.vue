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
const { getInvoices } = useInvoices();
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

// M2M invoices — managed as array of selected IDs
const selectedInvoiceIds = ref<string[]>([]);
const availableInvoices = ref<any[]>([]);
const loadingInvoices = ref(false);

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

  // Sync linked invoices
  const invoices = (props.event as any).invoices || [];
  selectedInvoiceIds.value = invoices
    .map((j: any) => j.invoices_id?.id || j.invoices_id)
    .filter(Boolean);
});

// Conditional field visibility based on type
const visibleFields = computed(() => {
  const t = form.type;
  return {
    showLink: ['General', 'Design', 'Content'].includes(t),
    showPrototypeLink: t === 'Design',
    showFiles: ['Design', 'Content', 'Financial'].includes(t),
    showInvoices: t === 'Financial',
    showApproval: ['Design', 'Content'].includes(t),
  };
});

// Fetch available invoices when type is Financial
watch(() => visibleFields.value.showInvoices, async (show) => {
  if (!show || availableInvoices.value.length > 0) return;
  const clientId = (props.project as any)?.client;
  if (!clientId) return;
  loadingInvoices.value = true;
  try {
    const { data } = await getInvoices({ limit: 200 });
    // Filter to invoices belonging to this project's client
    availableInvoices.value = data.filter((inv: any) =>
      inv.client?.id === clientId || inv.bill_to?.id === clientId
    );
  } catch (err) {
    console.error('Failed to fetch invoices:', err);
  } finally {
    loadingInvoices.value = false;
  }
}, { immediate: true });

const dirty = computed(() => {
  if (!props.event) return false;

  const origInvoiceIds = ((props.event as any).invoices || [])
    .map((j: any) => j.invoices_id?.id || j.invoices_id)
    .filter(Boolean)
    .sort()
    .join(',');
  const currentInvoiceIds = [...selectedInvoiceIds.value].sort().join(',');

  return (
    form.title !== (props.event.title || '') ||
    form.description !== (props.event.description || '') ||
    form.event_date !== (props.event.event_date || props.event.date || '') ||
    form.end_date !== (props.event.end_date || props.event.event_date || props.event.date || '') ||
    form.type !== (props.event.type || 'General') ||
    form.priority !== (props.event.priority || 'Normal') ||
    form.is_milestone !== Boolean(props.event.is_milestone) ||
    form.link !== ((props.event as any).link || '') ||
    form.prototype_link !== ((props.event as any).prototype_link || '') ||
    origInvoiceIds !== currentInvoiceIds
  );
});

const saving = ref(false);

async function save() {
  if (!dirty.value || saving.value) return;
  saving.value = true;
  try {
    const payload: Record<string, any> = {
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
    };

    // Include M2M invoices if Financial type
    if (visibleFields.value.showInvoices) {
      payload.invoices = selectedInvoiceIds.value.map(id => ({ invoices_id: id }));
    }

    await updateEvent(props.event.id, payload);
    toast.add({ title: 'Event updated', color: 'green' });
    emit('updated');
  } catch (err: any) {
    toast.add({ title: 'Failed to save', description: err?.message, color: 'red' });
  } finally {
    saving.value = false;
  }
}

function toggleInvoice(id: string) {
  const idx = selectedInvoiceIds.value.indexOf(id);
  if (idx >= 0) {
    selectedInvoiceIds.value.splice(idx, 1);
  } else {
    selectedInvoiceIds.value.push(id);
  }
}

function invoiceStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case 'paid': return 'text-green-600 bg-green-500/10';
    case 'sent': case 'pending': return 'text-amber-600 bg-amber-500/10';
    case 'overdue': return 'text-red-600 bg-red-500/10';
    case 'draft': return 'text-muted-foreground bg-muted';
    default: return 'text-muted-foreground bg-muted';
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

const typeOptions = ['General', 'Design', 'Content', 'Timeline', 'Financial', 'Hours'];
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

      <!-- Invoice Selector (Financial only) -->
      <div v-if="visibleFields.showInvoices" class="space-y-2">
        <label class="t-label text-muted-foreground">Linked Invoices</label>
        <div v-if="loadingInvoices" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
          Loading invoices...
        </div>
        <div v-else-if="availableInvoices.length === 0" class="text-xs text-muted-foreground">
          No invoices found for this client.
        </div>
        <div v-else class="flex flex-wrap gap-1.5">
          <button
            v-for="inv in availableInvoices"
            :key="inv.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            :class="selectedInvoiceIds.includes(inv.id)
              ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
              : 'text-muted-foreground hover:text-foreground hover:border-foreground/30'"
            @click="toggleInvoice(inv.id)"
          >
            <Icon
              :name="selectedInvoiceIds.includes(inv.id) ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-3 h-3"
            />
            <span class="font-medium">{{ inv.invoice_code }}</span>
            <span v-if="inv.total_amount != null">${{ Number(inv.total_amount).toLocaleString() }}</span>
            <span
              v-if="inv.status"
              class="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-semibold"
              :class="invoiceStatusColor(inv.status)"
            >{{ inv.status }}</span>
          </button>
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
