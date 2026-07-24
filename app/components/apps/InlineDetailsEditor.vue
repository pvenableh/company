<!--
  InlineDetailsEditor — a reusable, autosaving details form for any entity's
  Overview tab. Renders a labelled field per `fields` entry and writes each
  change straight back to Directus (debounced, optimistic) so a user can edit
  an item without leaving the slide-over.

    <AppsInlineDetailsEditor
      collection="clients"
      :item-id="client.id"
      :model-value="overviewValues"
      :fields="CLIENT_OVERVIEW_FIELDS"
      @updated="patch => Object.assign(client, patch)"
    />

  Field types: text | url | number | date | textarea | select (needs `options`).
  Each field saves independently on blur/change; the parent syncs its own copy
  from the `updated` patch so other tabs/badges stay consistent.
-->
<script setup lang="ts">
export interface DetailFieldDef {
  key: string;
  label: string;
  type?: 'text' | 'url' | 'number' | 'date' | 'textarea' | 'select' | 'richtext';
  options?: Array<{ value: any; label: string }>;
  placeholder?: string;
  /** Small prefix inside the control, e.g. '$'. */
  prefix?: string;
  rows?: number;
  /** Show an "Earnest Suggest" affordance that drafts this field's content. */
  suggest?: boolean;
  /** In a multi-column layout, span the full row (e.g. a title or textarea). */
  full?: boolean;
}

const props = withDefaults(defineProps<{
  collection: string;
  itemId: string;
  fields: DetailFieldDef[];
  modelValue: Record<string, any>;
  canEdit?: boolean;
  /** Client id used to ground "Earnest Suggest" brand context (optional). */
  suggestClientId?: string | null;
  /** Lay fields out in this many columns on larger screens (default 1). */
  columns?: 1 | 2 | 3;
}>(), { canEdit: true, columns: 1 });

// Single column keeps the original vertical stack; 2/3 columns switch to a
// responsive grid so short inputs (value, dates, status) sit side-by-side.
const containerCls = computed(() => {
  if (props.columns === 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-4';
  if (props.columns === 3) return 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';
  return 'space-y-4';
});

const emit = defineEmits<{ (e: 'updated', patch: Record<string, any>): void }>();

const items = useDirectusItems(props.collection);
const toast = useToast();
const { generateText } = useEarnestDraft();
const { selectedOrg } = useOrganization();
const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || null);
const singular = props.collection.replace(/s$/, '').replace(/_/g, ' ');

const suggestingKey = ref<string | null>(null);
async function suggest(f: DetailFieldDef, brief: string) {
  if (suggestingKey.value || !props.canEdit) return;
  suggestingKey.value = f.key;
  try {
    const text = await generateText({
      brief: (brief || '').trim() || `Write the ${f.label.toLowerCase()} for this ${singular}. Be specific, concrete, and concise.`,
      kind: f.label,
      currentValue: typeof local[f.key] === 'string' && local[f.key].trim() ? local[f.key] : null,
      maxWords: 180,
      clientId: props.suggestClientId ?? (props.collection === 'clients' ? props.itemId : null),
      organizationId: organizationId.value,
    });
    if (text) {
      local[f.key] = text;
      await saveField(f);
    }
  } catch (e: any) {
    toast.add({ title: 'Earnest could not suggest', description: e?.data?.message || e?.message || 'Try again', color: 'red' });
  } finally {
    suggestingKey.value = null;
  }
}

// Local editable copy, reseeded whenever the source values change.
const local = reactive<Record<string, any>>({});
watch(
  () => props.modelValue,
  (v) => { for (const f of props.fields) local[f.key] = v?.[f.key] ?? (f.type === 'number' ? '' : ''); },
  { immediate: true, deep: true },
);

const savingKey = ref<string | null>(null);
const savedKey = ref<string | null>(null);
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function normalize(f: DetailFieldDef, raw: any): any {
  if (f.type === 'number') {
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === 'string' && raw.trim() === '') return null;
  return raw;
}

async function saveField(f: DetailFieldDef) {
  if (!props.canEdit || !props.itemId) return;
  const value = normalize(f, local[f.key]);
  const current = props.modelValue?.[f.key] ?? null;
  // No-op guard so blur without a change doesn't write.
  if (JSON.stringify(value ?? null) === JSON.stringify(current ?? null)) return;

  savingKey.value = f.key;
  try {
    await items.update(props.itemId, { [f.key]: value });
    emit('updated', { [f.key]: value });
    savedKey.value = f.key;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (savedKey.value === f.key) savedKey.value = null; }, 1600);
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.message || e?.message || 'Update failed', color: 'red' });
    local[f.key] = current ?? ''; // rollback
  } finally {
    if (savingKey.value === f.key) savingKey.value = null;
  }
}

const inputCls =
  'w-full rounded-lg glass-field px-2.5 h-9 text-sm focus:outline-none transition-shadow';
const areaCls =
  'w-full rounded-2xl glass-field px-3 py-2 text-sm focus:outline-none transition-shadow resize-y';

function openUrl(v: string) {
  const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  window.open(href, '_blank', 'noopener');
}
</script>

<template>
  <div :class="containerCls">
    <div v-for="f in fields" :key="f.key" class="space-y-1" :class="{ 'sm:col-span-full': f.full && columns !== 1 }">
      <div class="flex items-center gap-2">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ f.label }}</label>
        <span v-if="savingKey === f.key" class="text-[10px] text-muted-foreground inline-flex items-center gap-1">
          <Icon name="lucide:loader-2" class="w-2.5 h-2.5 animate-spin" /> Saving
        </span>
        <span v-else-if="savedKey === f.key" class="text-[10px] text-success inline-flex items-center gap-1">
          <Icon name="lucide:check" class="w-2.5 h-2.5" /> Saved
        </span>
        <AIEarnestDraftButton
          v-if="f.suggest && canEdit"
          variant="link"
          label="Earnest Suggest"
          allow-empty
          :placeholder="`What should the ${f.label.toLowerCase()} emphasize? (optional)`"
          :loading="suggestingKey === f.key"
          class="ml-auto"
          @submit="(brief) => suggest(f, brief)"
        />
      </div>

      <!-- richtext (Tiptap) — renders + edits HTML WYSIWYG (no visible tags) -->
      <div v-if="f.type === 'richtext'" class="rounded-2xl border border-border overflow-hidden">
        <FormTiptap
          v-model="local[f.key]"
          height="min-h-24"
          custom-classes="p-3"
          :disabled="!canEdit"
          @blur="saveField(f)"
        />
      </div>

      <!-- textarea -->
      <textarea
        v-else-if="f.type === 'textarea'"
        v-model="local[f.key]"
        :rows="f.rows || 3"
        :placeholder="f.placeholder"
        :disabled="!canEdit"
        :class="areaCls"
        @blur="saveField(f)"
      />

      <!-- select -->
      <select
        v-else-if="f.type === 'select'"
        v-model="local[f.key]"
        :disabled="!canEdit"
        :class="inputCls"
        @change="saveField(f)"
      >
        <option value="">{{ f.placeholder || 'Select…' }}</option>
        <option v-for="opt in f.options || []" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
      </select>

      <!-- url (input + open affordance) -->
      <div v-else-if="f.type === 'url'" class="flex items-center gap-1.5">
        <input
          v-model="local[f.key]"
          type="text"
          inputmode="url"
          :placeholder="f.placeholder || 'https://'"
          :disabled="!canEdit"
          :class="inputCls"
          @blur="saveField(f)"
        />
        <button
          v-if="local[f.key]"
          type="button"
          class="shrink-0 w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center justify-center transition-colors"
          title="Open link"
          @click="openUrl(local[f.key])"
        >
          <Icon name="lucide:external-link" class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- number (with optional prefix) -->
      <div v-else-if="f.type === 'number'" class="relative">
        <span v-if="f.prefix" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">{{ f.prefix }}</span>
        <input
          v-model="local[f.key]"
          type="number"
          :placeholder="f.placeholder"
          :disabled="!canEdit"
          :class="[inputCls, f.prefix ? 'pl-6' : '']"
          @blur="saveField(f)"
        />
      </div>

      <!-- date -->
      <input
        v-else-if="f.type === 'date'"
        v-model="local[f.key]"
        type="date"
        :disabled="!canEdit"
        :class="inputCls"
        @change="saveField(f)"
      />

      <!-- text (default) -->
      <input
        v-else
        v-model="local[f.key]"
        type="text"
        :placeholder="f.placeholder"
        :disabled="!canEdit"
        :class="inputCls"
        @blur="saveField(f)"
      />
    </div>
  </div>
</template>
