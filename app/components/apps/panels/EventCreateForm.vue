<!--
  EventCreateForm — the rich "new project event" form body.

  Rendered by `panels/EventPanel.vue` in create mode. It captures everything
  that can be set BEFORE the event exists — scalars, links, file uploads, and
  "connect existing" relations (invoices, spawned projects, seed tasks) — then
  persists the event plus its junctions/children atomically and emits
  `created(eventId)`. Collaborative relations that need a saved event
  (comments, reactions, meetings, ongoing tasks) live in the detail workspace
  the panel swaps to afterward.

  Progressive disclosure: the collapsible sections auto-expand based on the
  chosen event `type` (Design → links + files, Financial → billing, …) so the
  form stays clean and only surfaces what's relevant. Any section can still be
  opened or closed manually.
-->
<script setup lang="ts">
import { toast } from 'vue-sonner';
import { Button } from '~/components/ui/button';
import { KIND_TO_SECTIONS, KIND_TO_TYPE } from '~~/shared/event-category-presets';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'created', eventId: string): void }>();

const eventItems = useDirectusItems('project_events');
const eventFileItems = useDirectusItems('project_events_files');
const eventInvoiceItems = useDirectusItems('project_events_invoices');
const projectItems = useDirectusItems('projects');
const categoryItems = useDirectusItems('project_event_categories');
const invoiceItems = useDirectusItems('invoices');
const eventListItems = useDirectusItems('project_events');
const { upload: uploadFile } = useDirectusFiles();
const { getOrgSubfolder } = useOrgFolders();
const { selectedOrg } = useOrganization();
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const { addTask } = useQuickTasks();

/* ── options ── */
const EVENT_STATUS_OPTIONS = [
  { label: 'Scheduled', value: 'Scheduled' },
  { label: 'Active', value: 'Active' },
  { label: 'Completed', value: 'Completed' },
];
const PRIORITY_OPTIONS = [
  { label: 'Normal', value: 'Normal' },
  { label: 'Urgent', value: 'Urgent' },
];
const APPROVAL_OPTIONS = [
  { label: 'No approval necessary', value: 'No Approval Necessary' },
  { label: 'Needs approval', value: 'Need Approval' },
  { label: 'Approved', value: 'Approved' },
];

/* ── form state ── */
const creating = ref(false);
const form = reactive({
  title: '',
  description: '',
  category_id: null as string | null,
  status: 'Active',
  priority: 'Normal',
  approval: 'No Approval Necessary',
  event_date: '',
  end_date: '',
  duration_days: '' as string | number,
  is_milestone: false,
  depends_on: null as string | null,
  assigned_to: [] as string[], // AssignmentPicker (single) → array of 0/1 ids
  prototype_link: '',
  link: '',
  payment_amount: '',
  hours: '',
  paid: false,
});
const stagedFiles = ref<File[]>([]);
const invoiceIds = ref<string[]>([]);
const projectIds = ref<string[]>([]);
const seedTasks = ref<string[]>([]);
const newTaskTitle = ref('');

/* ── context (org + client) resolved from the parent project ── */
const orgId = ref<string | null>(null);
const clientId = ref<string | null>(null);

onMounted(async () => {
  try {
    const project: any = await projectItems.get(props.projectId, {
      fields: ['id', 'organization', 'client'],
    });
    orgId.value = (typeof project?.organization === 'object' ? project.organization?.id : project?.organization) || selectedOrg.value || null;
    clientId.value = typeof project?.client === 'object' ? project.client?.id : project?.client ?? null;
  } catch {
    orgId.value = selectedOrg.value || null;
  }
  // Assignee options + categories + sibling events for the dependency picker.
  if (orgId.value) fetchFilteredUsers(orgId.value);
  loadCategories();
  loadSiblingEvents();
});

/* ── lookups ── */
const categories = ref<any[]>([]);
async function loadCategories() {
  try {
    const filter: any = { status: { _neq: 'archived' } };
    // Categories are per-org — only show this org's. (Falls back to unfiltered
    // if the org hasn't resolved yet, but onMounted resolves it first.)
    if (orgId.value) filter.organization = { _eq: orgId.value };
    categories.value = await categoryItems.list({
      fields: ['id', 'name', 'color', 'kind'],
      filter,
      sort: ['sort', 'name'],
      limit: 100,
    });
  } catch { categories.value = []; }
}
const categoryOptions = computed(() =>
  categories.value.map((c) => ({ label: c.name, value: c.id, color: c.color })));
const hasCategories = computed(() => categoryOptions.value.length > 0);
// The selected category's behavior `kind` is the classifier that drives form
// disclosure + the mirrored legacy `type`. Defaults to 'general' when unset.
const selectedCategory = computed(() => categories.value.find((c) => c.id === form.category_id));
const activeKind = computed<string>(() => (selectedCategory.value?.kind as string) || 'general');

const siblingEvents = ref<any[]>([]);
async function loadSiblingEvents() {
  try {
    siblingEvents.value = await eventListItems.list({
      fields: ['id', 'title'],
      filter: { project: { _eq: props.projectId } },
      sort: ['sort', 'event_date'],
      limit: 100,
    });
  } catch { siblingEvents.value = []; }
}
const dependsOnOptions = computed(() =>
  siblingEvents.value
    .filter((e) => e.title)
    .map((e) => ({ label: e.title, value: e.id })));

// Invoices — lazy, loaded the first time the Billing section opens.
const invoices = ref<any[]>([]);
const invoicesLoaded = ref(false);
async function loadInvoices() {
  if (invoicesLoaded.value) return;
  invoicesLoaded.value = true;
  try {
    const filter: any = clientId.value ? { client: { _eq: clientId.value } } : {};
    invoices.value = await invoiceItems.list({
      fields: ['id', 'invoice_code', 'total_amount', 'status'],
      filter,
      sort: ['-date_created'],
      limit: 100,
    });
  } catch { invoices.value = []; }
}
const invoiceOptions = computed(() =>
  invoices.value.map((i) => ({
    label: `${i.invoice_code || i.id}${i.total_amount != null ? ` · $${Number(i.total_amount).toLocaleString()}` : ''}${i.status ? ` (${i.status})` : ''}`,
    value: i.id,
  })));

// Projects to spawn/link — lazy, loaded when the Connections section opens.
const projects = ref<any[]>([]);
const projectsLoaded = ref(false);
async function loadProjects() {
  if (projectsLoaded.value) return;
  projectsLoaded.value = true;
  try {
    const filter: any = { id: { _neq: props.projectId } };
    if (orgId.value) filter.organization = { _eq: orgId.value };
    projects.value = await projectItems.list({
      fields: ['id', 'title'],
      filter,
      sort: ['title'],
      limit: 100,
    });
  } catch { projects.value = []; }
}
const projectOptions = computed(() =>
  projects.value.filter((p) => p.title).map((p) => ({ label: p.title, value: p.id })));

const assigneeUsers = computed(() => filteredUsers.value || []);

/* ── progressive-disclosure sections ── */
// Sections auto-open based on the selected category's `kind` (see
// KIND_TO_SECTIONS): design → figma+files, financial → billing, etc.
type SectionKey = 'timeline' | 'links' | 'files' | 'billing' | 'connections';
const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: 'timeline', label: 'Timeline & dependencies', icon: 'lucide:calendar-range' },
  { key: 'links', label: 'Figma & links', icon: 'lucide:link' },
  { key: 'files', label: 'Files & images', icon: 'lucide:paperclip' },
  { key: 'billing', label: 'Billing & invoices', icon: 'lucide:receipt' },
  { key: 'connections', label: 'Linked projects & tasks', icon: 'lucide:git-branch' },
];
// Manual open/close overrides; undefined → follow the kind-driven default.
const manual = reactive<Partial<Record<SectionKey, boolean>>>({});
function autoOpen(key: SectionKey) {
  return (KIND_TO_SECTIONS[activeKind.value as keyof typeof KIND_TO_SECTIONS] || []).includes(key);
}
function isOpen(key: SectionKey) {
  return manual[key] !== undefined ? manual[key]! : autoOpen(key);
}
function toggle(key: SectionKey) {
  const next = !isOpen(key);
  manual[key] = next;
  if (next && key === 'billing') loadInvoices();
  if (next && key === 'connections') loadProjects();
}
// Auto-loading lazy lookups when a section opens itself via a category change.
watch(() => form.category_id, () => {
  if (isOpen('billing')) loadInvoices();
  if (isOpen('connections')) loadProjects();
});
// Small activity counts shown on collapsed section headers.
function sectionCount(key: SectionKey): number {
  switch (key) {
    case 'links': return (form.prototype_link ? 1 : 0) + (form.link ? 1 : 0);
    case 'files': return stagedFiles.value.length;
    case 'billing': return invoiceIds.value.length + (form.payment_amount ? 1 : 0) + (form.hours ? 1 : 0);
    case 'connections': return projectIds.value.length + seedTasks.value.length;
    case 'timeline': return (form.event_date ? 1 : 0) + (form.end_date ? 1 : 0) + (form.depends_on ? 1 : 0);
  }
}

/* ── staged files ── */
function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files) return;
  stagedFiles.value.push(...Array.from(input.files));
  input.value = '';
}
function removeStagedFile(i: number) { stagedFiles.value.splice(i, 1); }

/* ── seed tasks ── */
function addSeedTask() {
  const t = newTaskTitle.value.trim();
  if (!t) return;
  seedTasks.value.push(t);
  newTaskTitle.value = '';
}
function removeSeedTask(i: number) { seedTasks.value.splice(i, 1); }

/* ── persist ── */
async function handleCreate() {
  if (!form.title.trim() || creating.value) return;
  creating.value = true;
  try {
    // 1. Upload any staged files first so we can link them to the new event.
    const uploadedIds: string[] = [];
    if (stagedFiles.value.length) {
      const folder = await getOrgSubfolder('Uploads').catch(() => null);
      for (const f of stagedFiles.value) {
        try {
          const up: any = await uploadFile(f, {
            title: `${form.title.trim()} - ${f.name}`,
            ...(folder ? { folder } : {}),
          });
          if (up?.id) uploadedIds.push(up.id);
        } catch (err: any) {
          toast.error(`Couldn't upload ${f.name}`);
        }
      }
    }

    // 2. Create the event row (scalars).
    const data: Record<string, any> = {
      title: form.title.trim(),
      // Legacy `type` is mirrored from the category's behavior kind so
      // type-based logic (billing trigger, AI timeline) keeps working.
      type: KIND_TO_TYPE[activeKind.value as keyof typeof KIND_TO_TYPE] || 'General',
      status: form.status,
      priority: form.priority,
      approval: form.approval,
      is_milestone: form.is_milestone,
      paid: form.paid,
      project: props.projectId,
    };
    if (form.description.trim()) data.description = form.description.trim();
    if (form.category_id) data.category_id = form.category_id;
    // Mirror event_date into legacy `date` so the event lands on the Gantt.
    if (form.event_date) { data.event_date = form.event_date; data.date = form.event_date; }
    if (form.end_date) data.end_date = form.end_date;
    if (form.duration_days !== '' && form.duration_days != null) data.duration_days = Number(form.duration_days);
    if (form.depends_on) data.depends_on = form.depends_on;
    if (form.assigned_to[0]) data.assigned_to = form.assigned_to[0];
    if (form.prototype_link.trim()) data.prototype_link = form.prototype_link.trim();
    if (form.link.trim()) data.link = form.link.trim();
    if (form.payment_amount) data.payment_amount = String(form.payment_amount);
    if (form.hours) data.hours = String(form.hours);

    const created: any = await eventItems.create(data);
    const eventId = created?.id;
    if (!eventId) throw new Error('Event was not created');

    // 3. Link junctions / reverse-FK relations in parallel.
    const jobs: Promise<any>[] = [];
    for (const fid of uploadedIds) {
      jobs.push(eventFileItems.create({ project_events_id: eventId, directus_files_id: fid }));
    }
    for (const iid of invoiceIds.value) {
      jobs.push(eventInvoiceItems.create({ project_events_id: eventId, invoices_id: iid }));
    }
    for (const pid of projectIds.value) {
      // spawned_projects is an o2m — set the reverse FK on each project.
      jobs.push(projectItems.update(pid, { parent_event_id: eventId }));
    }
    if (jobs.length) await Promise.allSettled(jobs);

    // 4. Seed initial tasks against the new event.
    for (const title of seedTasks.value) {
      try { await addTask(title, { projectEventId: eventId }); } catch { /* non-fatal */ }
    }

    toast.success('Event created');
    emit('created', String(eventId));
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || 'Failed to add event');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleCreate">
    <!-- ── Core (always visible) ── -->
    <div class="space-y-1">
      <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Title *</label>
      <EInput v-model="form.title" placeholder="Event title" autofocus />
    </div>

    <!-- Category is the classifier (it carries the behavior kind); Status + Priority alongside. -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Category</label>
        <ESelectMenu
          v-model="form.category_id"
          :options="categoryOptions"
          option-attribute="label"
          value-attribute="value"
          searchable
          placeholder="Uncategorized"
        />
      </div>
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
        <ESelectMenu v-model="form.status" :options="EVENT_STATUS_OPTIONS" option-attribute="label" value-attribute="value" />
      </div>
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</label>
        <ESelectMenu v-model="form.priority" :options="PRIORITY_OPTIONS" option-attribute="label" value-attribute="value" />
      </div>
    </div>
    <p v-if="!hasCategories" class="-mt-2 text-[10px] text-muted-foreground/60">
      No categories yet — add them in Settings → Event categories to classify and color events.
    </p>

    <div class="space-y-1">
      <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
      <ETextarea v-model="form.description" placeholder="What happens at this milestone?" :rows="3" />
    </div>

    <UiAssignmentPicker
      :model-value="form.assigned_to"
      :users="assigneeUsers"
      :multiple="false"
      label="Assigned to"
      empty-text="No one assigned"
      @update:model-value="(v: string[]) => (form.assigned_to = v)"
    />

    <div
      class="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 cursor-pointer select-none"
      role="switch"
      :aria-checked="form.is_milestone"
      @click="form.is_milestone = !form.is_milestone"
    >
      <span class="flex items-center gap-2 text-xs text-foreground/80">
        <Icon name="lucide:diamond" class="w-3.5 h-3.5 text-muted-foreground" />
        Mark as milestone <span class="text-muted-foreground/60">(diamond on the timeline)</span>
      </span>
      <Switch :model-value="form.is_milestone" class="pointer-events-none" />
    </div>

    <!-- ── Collapsible sections (progressive disclosure) ── -->
    <div class="space-y-2 pt-1">
      <div
        v-for="s in SECTIONS"
        :key="s.key"
        class="rounded-xl border border-border/60 overflow-hidden bg-muted/20"
      >
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
          @click="toggle(s.key)"
        >
          <Icon :name="s.icon" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span class="text-[11px] font-semibold text-foreground">{{ s.label }}</span>
          <span
            v-if="sectionCount(s.key)"
            class="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 leading-none"
          >{{ sectionCount(s.key) }}</span>
          <span
            v-else-if="autoOpen(s.key) && !isOpen(s.key)"
            class="text-[9px] uppercase tracking-wider text-muted-foreground/60"
          >Suggested</span>
          <Icon
            name="lucide:chevron-down"
            class="w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform"
            :class="isOpen(s.key) ? 'rotate-180' : ''"
          />
        </button>

        <div v-if="isOpen(s.key)" class="px-3 pb-3 pt-1 border-t border-border/60 space-y-3">
          <!-- Timeline & dependencies -->
          <template v-if="s.key === 'timeline'">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Date</label>
                <EInput v-model="form.event_date" type="date" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">End date</label>
                <EInput v-model="form.end_date" type="date" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Duration (business days)</label>
                <EInput v-model="form.duration_days" type="number" min="0" placeholder="e.g. 5" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Approval</label>
                <ESelectMenu v-model="form.approval" :options="APPROVAL_OPTIONS" option-attribute="label" value-attribute="value" />
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Depends on</label>
              <ESelectMenu
                v-model="form.depends_on"
                :options="dependsOnOptions"
                option-attribute="label"
                value-attribute="value"
                searchable
                placeholder="No dependency"
              />
            </div>
          </template>

          <!-- Figma & links -->
          <template v-else-if="s.key === 'links'">
            <div class="space-y-1">
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Figma / prototype link</label>
              <EInput v-model="form.prototype_link" type="url" placeholder="https://figma.com/…" />
              <p class="text-[10px] text-muted-foreground/60">Embeds live in the event's detail view.</p>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Reference link</label>
              <EInput v-model="form.link" type="url" placeholder="https://…" />
            </div>
          </template>

          <!-- Files & images -->
          <template v-else-if="s.key === 'files'">
            <label
              class="flex flex-col items-center justify-center gap-1 py-4 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <Icon name="lucide:upload-cloud" class="w-5 h-5 text-muted-foreground" />
              <span class="text-[11px] text-muted-foreground">Click to attach files or images</span>
              <input type="file" multiple class="hidden" @change="onFilesPicked" />
            </label>
            <ul v-if="stagedFiles.length" class="space-y-1">
              <li
                v-for="(f, i) in stagedFiles"
                :key="i"
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 text-xs text-foreground"
              >
                <Icon name="lucide:file" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span class="truncate flex-1">{{ f.name }}</span>
                <button type="button" class="text-muted-foreground hover:text-destructive" @click="removeStagedFile(i)">
                  <Icon name="lucide:x" class="w-3.5 h-3.5" />
                </button>
              </li>
            </ul>
          </template>

          <!-- Billing & invoices -->
          <template v-else-if="s.key === 'billing'">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Payment amount</label>
                <EInput v-model="form.payment_amount" type="number" min="0" step="0.01" placeholder="0.00" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Hours</label>
                <EInput v-model="form.hours" type="number" min="0" step="0.25" placeholder="0" />
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Connect invoices</label>
              <ESelectMenu
                v-model="invoiceIds"
                :options="invoiceOptions"
                option-attribute="label"
                value-attribute="value"
                multiple
                searchable
                :placeholder="invoicesLoaded ? 'Select invoices' : 'Loading…'"
              />
            </div>
            <div
              class="flex items-center justify-between gap-3 text-xs text-foreground/80 cursor-pointer select-none"
              role="switch"
              :aria-checked="form.paid"
              @click="form.paid = !form.paid"
            >
              <span>Marked as paid</span>
              <Switch :model-value="form.paid" class="pointer-events-none" />
            </div>
          </template>

          <!-- Linked projects & tasks -->
          <template v-else-if="s.key === 'connections'">
            <div class="space-y-1">
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Spawned / linked projects</label>
              <ESelectMenu
                v-model="projectIds"
                :options="projectOptions"
                option-attribute="label"
                value-attribute="value"
                multiple
                searchable
                :placeholder="projectsLoaded ? 'Select projects' : 'Loading…'"
              />
              <p class="text-[10px] text-muted-foreground/60">Links a project as spawned from this milestone.</p>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Seed tasks</label>
              <div class="flex items-center gap-2">
                <EInput
                  v-model="newTaskTitle"
                  placeholder="Task title"
                  class="flex-1"
                  @keydown.enter.prevent="addSeedTask"
                />
                <button
                  type="button"
                  class="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 shrink-0"
                  @click="addSeedTask"
                >
                  <Icon name="lucide:plus" class="w-4 h-4" />
                </button>
              </div>
              <ul v-if="seedTasks.length" class="space-y-1">
                <li
                  v-for="(t, i) in seedTasks"
                  :key="i"
                  class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 text-xs text-foreground"
                >
                  <Icon name="lucide:check-square" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span class="truncate flex-1">{{ t }}</span>
                  <button type="button" class="text-muted-foreground hover:text-destructive" @click="removeSeedTask(i)">
                    <Icon name="lucide:x" class="w-3.5 h-3.5" />
                  </button>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="flex justify-end pt-1">
      <Button size="sm" type="submit" :disabled="creating || !form.title.trim()">
        <Icon v-if="creating" name="lucide:loader-2" class="animate-spin w-3 h-3 mr-1" />
        Create Event
      </Button>
    </div>
  </form>
</template>
