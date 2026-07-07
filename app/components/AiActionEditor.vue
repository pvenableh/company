<!--
  AiActionEditor — inline editor for a PENDING ai_actions row, so the user can
  adjust what Earnest proposed before approving it. Rendered by <AiActivityList>
  when a pending card enters "edit" mode.

  Handles the create/edit-workflow action types: create_project, add_event,
  create_invoice, create_tasks, update_field, send_email. On save it recomputes
  the human-facing `preview` + `title` (mirroring the server proposers) and
  PATCHes /api/ai/actions/[id]/edit — the executor still re-validates on approve.

  Emits:
    saved  ({ payload, preview, title })  — after a successful PATCH
    cancel
-->
<script setup lang="ts">
import { Button } from '~/components/ui/button';

const props = defineProps<{ action: any }>();
const emit = defineEmits<{
  (e: 'saved', patch: { payload: any; preview: any; title: string }): void;
  (e: 'cancel'): void;
}>();

const toast = useToast();
const saving = ref(false);

// Deep clone so edits don't mutate the card until saved.
const p = reactive<Record<string, any>>(JSON.parse(JSON.stringify(props.action?.payload ?? {})));
const type = computed(() => props.action?.action_type as string);

function fmtUsd(n: number): string {
  return `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── array helpers ─────────────────────────────────────────────────────────────
function ensureArray(key: string) { if (!Array.isArray(p[key])) p[key] = []; }
function addEvent() { ensureArray('events'); p.events.push({ title: '', tasks: [] }); }
function removeEvent(i: number) { p.events.splice(i, 1); }
function addEventTask(ev: any) { if (!Array.isArray(ev.tasks)) ev.tasks = []; ev.tasks.push({ title: '' }); }
function removeEventTask(ev: any, i: number) { ev.tasks.splice(i, 1); }
function addProjectTask() { ensureArray('tasks'); p.tasks.push({ title: '' }); }
function removeProjectTask(i: number) { p.tasks.splice(i, 1); }
function addLine() { ensureArray('line_items'); p.line_items.push({ description: '', quantity: 1, rate: 0 }); }
function removeLine(i: number) { p.line_items.splice(i, 1); }
function addTask() { ensureArray('tasks'); p.tasks.push({ title: '' }); }
function removeTask(i: number) { p.tasks.splice(i, 1); }

const invoiceSubtotal = computed(() =>
  (Array.isArray(p.line_items) ? p.line_items : []).reduce(
    (s: number, li: any) => s + (Number(li.quantity) || 0) * (Number(li.rate) || 0), 0));

// ── build cleaned payload + preview + title on save ─────────────────────────────
function cleanEvents(raw: any[]): { events: any[]; taskCount: number } {
  const events: any[] = [];
  let taskCount = 0;
  for (const e of Array.isArray(raw) ? raw : []) {
    const title = (e?.title ?? '').toString().trim();
    if (!title) continue;
    const ev: Record<string, any> = { ...e, title };
    const tasks = (Array.isArray(e.tasks) ? e.tasks : [])
      .map((t: any) => ({ ...t, title: (t?.title ?? '').toString().trim() }))
      .filter((t: any) => t.title);
    if (tasks.length) { ev.tasks = tasks; taskCount += tasks.length; } else { delete ev.tasks; }
    events.push(ev);
  }
  return { events, taskCount };
}

function build(): { payload: any; preview: any; title: string } {
  const t = type.value;

  if (t === 'create_project') {
    const title = (p.title ?? '').toString().trim() || 'Untitled project';
    const { events, taskCount: eventTasks } = cleanEvents(p.events);
    const tasks = (Array.isArray(p.tasks) ? p.tasks : [])
      .map((x: any) => ({ ...x, title: (x?.title ?? '').toString().trim() }))
      .filter((x: any) => x.title);
    const total = eventTasks + tasks.length;
    const parts: string[] = [];
    if (events.length) parts.push(`${events.length} event${events.length !== 1 ? 's' : ''}`);
    if (total) parts.push(`${total} task${total !== 1 ? 's' : ''}`);
    const rowTitle = `Create project "${title}"${parts.length ? ` with ${parts.join(' and ')}` : ''}`;
    const payload = { ...p, title, events, tasks };
    const preview = {
      kind: 'create_project', title, description: p.description ?? null,
      start_date: p.start_date ?? null, due_date: p.due_date ?? null,
      events: events.map((e) => ({ title: e.title, event_date: e.event_date ?? null, taskCount: (e.tasks || []).length })),
      projectTaskCount: tasks.length,
    };
    return { payload, preview, title: rowTitle };
  }

  if (t === 'add_event') {
    const { events, taskCount } = cleanEvents(p.events);
    const parts = [`${events.length} event${events.length !== 1 ? 's' : ''}`];
    if (taskCount) parts.push(`${taskCount} task${taskCount !== 1 ? 's' : ''}`);
    const rowTitle = `Add ${parts.join(' and ')} to project`;
    return {
      payload: { ...p, events },
      preview: { kind: 'add_event', events: events.map((e) => ({ title: e.title, event_date: e.event_date ?? null, taskCount: (e.tasks || []).length })) },
      title: rowTitle,
    };
  }

  if (t === 'create_invoice') {
    const line_items = (Array.isArray(p.line_items) ? p.line_items : [])
      .map((li: any) => {
        const description = (li?.description ?? '').toString().trim();
        const rate = Number(li?.rate);
        if (!description || !Number.isFinite(rate)) return null;
        const quantity = Number.isFinite(Number(li?.quantity)) && Number(li?.quantity) > 0 ? Number(li.quantity) : 1;
        return { ...li, description, rate: Math.round(rate * 100) / 100, quantity };
      })
      .filter(Boolean);
    const subtotal = line_items.reduce((s: number, li: any) => s + li.quantity * li.rate, 0);
    const rowTitle = `Create invoice — ${fmtUsd(subtotal)} (${line_items.length} item${line_items.length !== 1 ? 's' : ''})`;
    return {
      payload: { ...p, line_items },
      preview: { kind: 'create_invoice', subtotal, due_date: p.due_date ?? null, lineItems: line_items.map((li: any) => ({ description: li.description, quantity: li.quantity, rate: li.rate, amount: Math.round(li.quantity * li.rate * 100) / 100 })) },
      title: rowTitle,
    };
  }

  if (t === 'create_tasks') {
    const tasks = (Array.isArray(p.tasks) ? p.tasks : [])
      .map((x: any) => ({ ...x, title: (x?.title ?? '').toString().trim() }))
      .filter((x: any) => x.title);
    const rowTitle = tasks.length === 1 ? `Create task: ${tasks[0].title}` : `Create ${tasks.length} tasks`;
    return {
      payload: { ...p, tasks },
      preview: { ...(props.action?.preview || {}), kind: 'create_tasks', tasks: tasks.map((x: any) => x.title) },
      title: rowTitle,
    };
  }

  if (t === 'create_ticket') {
    const title = (p.title ?? '').toString().trim() || 'Untitled ticket';
    const tasks = (Array.isArray(p.tasks) ? p.tasks : [])
      .map((x: any) => ({ ...x, title: (x?.title ?? '').toString().trim() }))
      .filter((x: any) => x.title);
    const rowTitle = `Create ticket "${title}"${tasks.length ? ` with ${tasks.length} task${tasks.length !== 1 ? 's' : ''}` : ''}`;
    return {
      payload: { ...p, title, tasks },
      preview: { ...(props.action?.preview || {}), kind: 'create_ticket', title, priority: p.priority ?? null, tasks: tasks.map((x: any) => x.title) },
      title: rowTitle,
    };
  }

  if (t === 'update_field') {
    const value = p.value;
    const rowTitle = `Set ${p.collection} ${p.field} → ${String(value)}`;
    return {
      payload: { ...p, value },
      preview: { ...(props.action?.preview || {}), kind: 'update_field', collection: p.collection, id: p.id, field: p.field, value },
      title: rowTitle,
    };
  }

  if (t === 'send_email') {
    const subject = (p.subject ?? '').toString().trim();
    const recipient = p.to || (p.contactId ? `contact ${p.contactId}` : '');
    const rowTitle = `Email to ${recipient}: ${subject}`;
    return {
      payload: { ...p, subject },
      preview: { ...(props.action?.preview || {}), kind: 'email', to: p.to || null, contactId: p.contactId ?? null, subject, heading: p.heading ?? subject, bodyHtml: p.bodyHtml ?? '' },
      title: rowTitle,
    };
  }

  // Fallback: persist payload as-is, keep preview/title.
  return { payload: { ...p }, preview: props.action?.preview ?? null, title: props.action?.title ?? '' };
}

const editable = computed(() => ['create_project', 'add_event', 'create_ticket', 'create_invoice', 'create_tasks', 'update_field', 'send_email'].includes(type.value));

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const { payload, preview, title } = build();
    await $fetch(`/api/ai/actions/${props.action.id}/edit`, { method: 'POST', body: { payload, preview, title } });
    emit('saved', { payload, preview, title });
  } catch (e: any) {
    toast.add({ title: 'Could not save changes', description: e?.data?.message || e?.message, color: 'red' });
  } finally {
    saving.value = false;
  }
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-2.5 h-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30';
</script>

<template>
  <div class="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 space-y-2.5">
    <div v-if="!editable" class="text-[11px] text-muted-foreground">This action type can't be edited here.</div>

    <!-- create_project / add_event -->
    <template v-else-if="type === 'create_project' || type === 'add_event'">
      <div v-if="type === 'create_project'" class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Project title</label>
        <input v-model="p.title" :class="inputCls" placeholder="Project title" />
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Events</span>
          <button type="button" class="text-[11px] text-primary hover:underline" @click="addEvent">+ Event</button>
        </div>
        <div v-for="(ev, ei) in (p.events || [])" :key="ei" class="rounded-lg border border-border/60 bg-background p-2 space-y-1.5">
          <div class="flex items-center gap-1.5">
            <input v-model="ev.title" :class="inputCls" placeholder="Event / phase title" />
            <input v-model="ev.event_date" type="date" :class="[inputCls, 'w-36']" />
            <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive" title="Remove event" @click="removeEvent(ei)">
              <Icon name="lucide:x" class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="pl-3 space-y-1">
            <div v-for="(tk, ti) in (ev.tasks || [])" :key="ti" class="flex items-center gap-1.5">
              <Icon name="lucide:corner-down-right" class="w-3 h-3 text-muted-foreground/50 shrink-0" />
              <input v-model="tk.title" :class="inputCls" placeholder="Task" />
              <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive" @click="removeEventTask(ev, ti)">
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </div>
            <button type="button" class="text-[11px] text-primary hover:underline ml-4" @click="addEventTask(ev)">+ Task</button>
          </div>
        </div>
      </div>

      <div v-if="type === 'create_project'" class="space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Project tasks</span>
          <button type="button" class="text-[11px] text-primary hover:underline" @click="addProjectTask">+ Task</button>
        </div>
        <div v-for="(tk, ti) in (p.tasks || [])" :key="ti" class="flex items-center gap-1.5">
          <input v-model="tk.title" :class="inputCls" placeholder="Task" />
          <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive" @click="removeProjectTask(ti)">
            <Icon name="lucide:x" class="w-3 h-3" />
          </button>
        </div>
      </div>
    </template>

    <!-- create_invoice -->
    <template v-else-if="type === 'create_invoice'">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Line items</span>
        <button type="button" class="text-[11px] text-primary hover:underline" @click="addLine">+ Line</button>
      </div>
      <div v-for="(li, i) in (p.line_items || [])" :key="i" class="flex items-center gap-1.5">
        <input v-model="li.description" :class="inputCls" placeholder="Description" />
        <input v-model.number="li.quantity" type="number" min="0" step="0.25" :class="[inputCls, 'w-16']" title="Qty" />
        <input v-model.number="li.rate" type="number" min="0" step="1" :class="[inputCls, 'w-24']" title="Rate" />
        <span class="text-[11px] text-muted-foreground w-20 text-right shrink-0">{{ fmtUsd((Number(li.quantity)||0) * (Number(li.rate)||0)) }}</span>
        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive" @click="removeLine(i)">
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </div>
      <div class="flex items-center justify-between pt-1 border-t border-border/40 text-[11px]">
        <span class="text-muted-foreground">Subtotal</span>
        <span class="font-semibold">{{ fmtUsd(invoiceSubtotal) }}</span>
      </div>
    </template>

    <!-- create_ticket -->
    <template v-else-if="type === 'create_ticket'">
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Ticket title</label>
        <input v-model="p.title" :class="inputCls" placeholder="Ticket title" />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks</span>
        <button type="button" class="text-[11px] text-primary hover:underline" @click="addTask">+ Task</button>
      </div>
      <div v-for="(tk, i) in (p.tasks || [])" :key="i" class="flex items-center gap-1.5">
        <input v-model="tk.title" :class="inputCls" placeholder="Task" />
        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive" @click="removeTask(i)">
          <Icon name="lucide:x" class="w-3 h-3" />
        </button>
      </div>
    </template>

    <!-- create_tasks -->
    <template v-else-if="type === 'create_tasks'">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks</span>
        <button type="button" class="text-[11px] text-primary hover:underline" @click="addTask">+ Task</button>
      </div>
      <div v-for="(tk, i) in (p.tasks || [])" :key="i" class="flex items-center gap-1.5">
        <input v-model="tk.title" :class="inputCls" placeholder="Task" />
        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive" @click="removeTask(i)">
          <Icon name="lucide:x" class="w-3 h-3" />
        </button>
      </div>
    </template>

    <!-- update_field -->
    <template v-else-if="type === 'update_field'">
      <p class="text-[11px] text-muted-foreground">
        Set <span class="font-medium text-foreground">{{ p.field }}</span> on {{ p.collection }}
      </p>
      <input v-model="p.value" :class="inputCls" placeholder="New value" />
    </template>

    <!-- send_email -->
    <template v-else-if="type === 'send_email'">
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</label>
        <input v-model="p.subject" :class="inputCls" placeholder="Subject" />
      </div>
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Body</label>
        <div class="rounded-xl border border-border overflow-hidden bg-background">
          <FormTiptap v-model="p.bodyHtml" height="min-h-20" custom-classes="p-2.5" />
        </div>
      </div>
    </template>

    <!-- Actions -->
    <div class="flex items-center justify-end gap-2 pt-1">
      <button type="button" class="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1" @click="emit('cancel')">Cancel</button>
      <Button size="sm" class="h-7 rounded-full px-3 text-[11px]" :disabled="saving || !editable" @click="save">
        <Icon v-if="saving" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
        <Icon v-else name="lucide:check" class="w-3 h-3" />
        Save changes
      </Button>
    </div>
  </div>
</template>
