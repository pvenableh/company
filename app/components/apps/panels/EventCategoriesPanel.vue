<!--
  EventCategoriesPanel — manage the org's project-event categories (the colored,
  behavior-carrying labels that classify events and render on the Gantt). Opened
  as a slide-over from Organization → Settings.

  Three modes, all inline (no nested modal over the slide-over):
    • list  — the org's categories with edit/delete
    • edit  — inline create/edit form (name, colors, icon, behavior `kind`)
    • seed  — one-click seed of a "standard pack", auto-matched to the org's
              industry, that the org then fully owns and customizes.

  Writes route through `useProjectEventCategories` → the org-stamped, matrix-gated
  items endpoint. Managing is gated on the `projects` update permission.
-->
<script setup lang="ts">
import { toast } from 'vue-sonner';
import { Button } from '~/components/ui/button';
import { legibleTextOn } from '~/utils/color-contrast';
import { CATEGORY_PACKS, KIND_OPTIONS, packKeyForIndustryClass } from '~~/shared/event-category-presets';
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const { list, create, update, remove, seed, industryClass } = useProjectEventCategories();
const { canEdit, canDelete } = useOrgRole();
const canManage = computed(() => canEdit('projects'));

const items = ref<any[]>([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    items.value = await list({ includeArchived: true });
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

/* ── seeding ── */
const packKeys = Object.keys(CATEGORY_PACKS);
const selectedPackKey = ref('default');
const seeding = ref(false);
const selectedPack = computed(() => CATEGORY_PACKS[selectedPackKey.value] || CATEGORY_PACKS.default);

onMounted(async () => {
  await load();
  // Auto-select the pack matching the org's industry.
  try {
    const cls = await industryClass();
    selectedPackKey.value = packKeyForIndustryClass(cls);
  } catch { /* keep default */ }
});

async function seedPack() {
  if (seeding.value) return;
  seeding.value = true;
  try {
    const created = await seed(selectedPack.value.categories);
    items.value = [...created, ...items.value];
    toast.success(`Added ${created.length} categories`);
    mode.value = 'list';
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || 'Failed to add categories');
  } finally {
    seeding.value = false;
  }
}

/* ── inline editor ── */
const mode = ref<'list' | 'edit' | 'seed'>('list');
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = reactive({ name: '', color: '#4da6ff', text_color: '', icon: '', kind: 'general', status: 'published' });

const EMOJI_OPTIONS = [
  '🎨', '✏️', '🖼️', '🎬', '📷', '🎵',
  '🌐', '📱', '💻', '⚙️', '🤖', '🔧',
  '📣', '📢', '✉️', '📰', '📊', '📈',
  '💼', '📦', '🛍️', '🏷️', '🎯', '✨',
  '🚀', '💡', '👀', '✅', '💳', '📅',
];

function openNew() {
  editingId.value = null;
  Object.assign(form, { name: '', color: '#4da6ff', text_color: '', icon: '', kind: 'general', status: 'published' });
  mode.value = 'edit';
}
function openEdit(row: any) {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name || '',
    color: row.color || '#4da6ff',
    text_color: row.text_color || '',
    icon: row.icon || '',
    kind: row.kind || 'general',
    status: row.status || 'published',
  });
  mode.value = 'edit';
}

const effectiveTextColor = computed(() => form.text_color || legibleTextOn(form.color || '#4da6ff'));
const previewStyle = computed(() => ({ backgroundColor: form.color || '#4da6ff', color: effectiveTextColor.value }));

async function save() {
  if (!form.name.trim() || saving.value) return;
  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      color: form.color || null,
      text_color: form.text_color || legibleTextOn(form.color || '#4da6ff'),
      icon: form.icon?.trim() || null,
      kind: form.kind,
      status: form.status,
    };
    if (editingId.value) {
      const updated = await update(editingId.value, payload);
      const i = items.value.findIndex((c) => c.id === editingId.value);
      if (i >= 0) items.value[i] = { ...items.value[i], ...updated };
      toast.success('Category updated');
    } else {
      const created = await create(payload);
      items.value.unshift(created);
      toast.success('Category created');
    }
    mode.value = 'list';
    editingId.value = null;
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || 'Failed to save category');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row: any) {
  if (!confirm(`Delete category "${row.name}"? Events keep their data but lose this label.`)) return;
  try {
    await remove(row.id);
    items.value = items.value.filter((c) => c.id !== row.id);
    toast.success('Category deleted');
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || 'Failed to delete category');
  }
}

function chipStyle(row: any) {
  return { backgroundColor: row.color || '#4da6ff', color: row.text_color || legibleTextOn(row.color || '#4da6ff') };
}
</script>

<template>
  <AppSlideOverShell
    title="Event Categories"
    subtitle="Colored, industry-aware labels for timeline events"
    @close="$emit('close')"
  >
    <template v-if="canManage && mode === 'list' && items.length" #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
        @click="openNew"
      >
        <Icon name="lucide:plus" class="w-3.5 h-3.5" />
        New Category
      </button>
    </template>

    <!-- ── List ── -->
    <div v-if="mode === 'list'" class="space-y-3">
      <div v-if="loading" class="text-sm text-muted-foreground text-center py-8">Loading…</div>

      <div v-else-if="!items.length" class="text-center py-8">
        <div class="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
          <Icon name="lucide:tags" class="w-6 h-6 text-muted-foreground/50" />
        </div>
        <p class="text-sm text-foreground font-medium">No categories yet</p>
        <p class="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
          Start from a standard pack matched to your industry — then rename, recolor, or add your own.
        </p>
        <div v-if="canManage" class="mt-4 flex items-center justify-center gap-2">
          <Button size="sm" @click="mode = 'seed'">
            <Icon name="lucide:sparkles" class="w-3.5 h-3.5 mr-1" />
            Add standard pack
          </Button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            @click="openNew"
          >
            Start blank
          </button>
        </div>
      </div>

      <template v-else>
        <ul class="space-y-2">
          <li
            v-for="row in items"
            :key="row.id"
            class="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
          >
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold shrink-0"
              :style="chipStyle(row)"
            >
              <span v-if="row.icon" class="leading-none">{{ row.icon }}</span>
              {{ row.name }}
            </span>
            <span v-if="row.kind && row.kind !== 'general'" class="text-[10px] uppercase tracking-wider text-muted-foreground/60">{{ row.kind }}</span>
            <span v-if="row.status === 'archived'" class="text-[10px] uppercase tracking-wider text-muted-foreground/40">Archived</span>
            <div class="ml-auto flex items-center gap-1">
              <button
                v-if="canManage"
                type="button"
                class="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                title="Edit"
                @click="openEdit(row)"
              >
                <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
              </button>
              <button
                v-if="canDelete('projects')"
                type="button"
                class="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Delete"
                @click="handleDelete(row)"
              >
                <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        </ul>
        <button
          v-if="canManage"
          type="button"
          class="w-full text-[11px] text-muted-foreground hover:text-foreground py-2"
          @click="mode = 'seed'"
        >
          + Add a standard pack
        </button>
      </template>
    </div>

    <!-- ── Seed a standard pack ── -->
    <div v-else-if="mode === 'seed'" class="space-y-4">
      <p class="text-xs text-muted-foreground">
        Pick a starter pack. These become your own editable categories — rename, recolor, or delete any after.
      </p>
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Pack</label>
        <ESelectMenu
          v-model="selectedPackKey"
          :options="packKeys.map(k => ({ label: CATEGORY_PACKS[k].label, value: k }))"
          option-attribute="label"
          value-attribute="value"
        />
        <p class="text-[11px] text-muted-foreground/70">{{ selectedPack.blurb }}</p>
      </div>

      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Preview ({{ selectedPack.categories.length }})</label>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="c in selectedPack.categories"
            :key="c.name"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold"
            :style="{ backgroundColor: c.color, color: legibleTextOn(c.color) }"
          >
            <span class="leading-none">{{ c.icon }}</span>
            {{ c.name }}
          </span>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 pt-1">
        <button type="button" class="text-[12px] font-semibold text-muted-foreground hover:text-foreground" @click="mode = 'list'">Back</button>
        <Button size="sm" :disabled="seeding" @click="seedPack">
          <Icon v-if="seeding" name="lucide:loader-2" class="animate-spin w-3 h-3 mr-1" />
          Add {{ selectedPack.categories.length }} categories
        </Button>
      </div>
    </div>

    <!-- ── Inline editor ── -->
    <form v-else class="space-y-4" @submit.prevent="save">
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Name *</label>
        <EInput v-model="form.name" placeholder="e.g. Design" autofocus />
      </div>

      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Behavior</label>
        <ESelectMenu v-model="form.kind" :options="KIND_OPTIONS" option-attribute="label" value-attribute="value" />
        <p class="text-[11px] text-muted-foreground/70">Controls which sections the event form opens and whether it can be billed.</p>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Background</label>
          <div class="flex items-center gap-2">
            <label class="relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-border cursor-pointer overflow-hidden shrink-0" :style="{ backgroundColor: form.color || '#4da6ff' }">
              <input type="color" :value="form.color || '#4da6ff'" class="absolute inset-0 opacity-0 cursor-pointer" @input="form.color = ($event.target as HTMLInputElement).value" />
            </label>
            <EInput v-model="form.color" placeholder="#4da6ff" class="flex-1" />
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Text</label>
          <div class="flex items-center gap-2">
            <label class="relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-border cursor-pointer overflow-hidden shrink-0" :style="{ backgroundColor: effectiveTextColor }">
              <input type="color" :value="effectiveTextColor" class="absolute inset-0 opacity-0 cursor-pointer" @input="form.text_color = ($event.target as HTMLInputElement).value" />
            </label>
            <EInput v-model="form.text_color" :placeholder="`${effectiveTextColor} (auto)`" class="flex-1" />
          </div>
        </div>
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Icon</label>
          <button v-if="form.icon" type="button" class="text-[11px] text-muted-foreground hover:text-foreground underline" @click="form.icon = ''">Clear</button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="e in EMOJI_OPTIONS"
            :key="e"
            type="button"
            class="w-8 h-8 rounded-md text-base flex items-center justify-center transition-colors"
            :class="form.icon === e ? 'bg-muted/70 ring-1 ring-primary/40' : 'bg-muted/20 hover:bg-muted/60'"
            @click="form.icon = e"
          >{{ e }}</button>
        </div>
      </div>

      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</label>
        <div>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold" :style="previewStyle">
            <span v-if="form.icon" class="leading-none">{{ form.icon }}</span>
            {{ form.name || 'Category name' }}
          </span>
        </div>
      </div>

      <div
        class="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer select-none"
        @click="form.status = form.status === 'archived' ? 'published' : 'archived'"
      >
        <input type="checkbox" class="rounded border-border pointer-events-none" :checked="form.status === 'archived'" />
        Archived (hidden from the category picker)
      </div>

      <div class="flex items-center justify-between gap-2 pt-1">
        <button type="button" class="text-[12px] font-semibold text-muted-foreground hover:text-foreground" @click="mode = 'list'">Back</button>
        <Button size="sm" type="submit" :disabled="saving || !form.name.trim()">
          <Icon v-if="saving" name="lucide:loader-2" class="animate-spin w-3 h-3 mr-1" />
          {{ editingId ? 'Save' : 'Create' }}
        </Button>
      </div>
    </form>
  </AppSlideOverShell>
</template>
