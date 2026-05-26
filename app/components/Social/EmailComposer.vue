<script setup lang="ts">
/**
 * EmailComposer — the z=3 in-canvas email composer.
 *
 * P3 Phase 3.3 + 3.4 (composition-canvas-redesign). Sibling of
 * `CompositionComposer.vue` (the social composer). The two components are
 * intentionally separate: their field shapes diverge enough that one
 * form with two configs would be more confusing than two siblings (this
 * was tried before — see handoff guidance on the "one form, two
 * configs" trap).
 *
 * Fields: subject, preview text, body (Markdown via UTextarea — Tiptap
 * is deferred until the body editor needs richer affordances), audience
 * segment, CTA, schedule. Save routes through `useComposition().update`
 * (edit mode) or `useComposition().create` (P3.4 create mode — no
 * touchId or sentinel `compose:email`). In create mode the schedule
 * picker stays as-is; status defaults to 'draft' until the user
 * unticks the draft checkbox.
 *
 * Coexistence: this is ADDITIVE. The legacy `MarketingTouchEditor` (if
 * any) and `/marketing/*` deep-links keep working — only canvas-internal
 * interactions push to this composer. P3.6 will collapse the duplication.
 *
 * Motion: opacity + 1.04 → 1.0 scale entry, master spring. The canvas
 * host runs the crossfade against the lifted card; this component just
 * paints itself once it's mounted.
 *
 * @see app/composables/useComposition.ts — the adapter (P3.0 + 3.3).
 * @see app/components/Social/CompositionComposer.vue — the social sibling.
 */
import { Icon } from '#components';
import { format, addHours, roundToNearestMinutes } from 'date-fns';
import type {
  EmailComposition,
  CompositionPatch,
} from '~~/shared/composition';
import type {
  EmailCTA,
  AudienceFilter,
} from '~~/shared/marketing-persistence';

const props = defineProps<{
  /** Active touch id (canvas activeId — `touch:<n>` form). When this is
   *  null/undefined OR the `compose:email` sentinel the composer enters
   *  create mode: skip load, blank form, save → POST instead of PATCH. */
  touchId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', composition: EmailComposition): void;
  (e: 'created', composition: EmailComposition): void;
}>();

const toast = useToast();
const { fetchById, update, create } = useComposition();
const { selectedOrg } = useOrganization();

/** True while no real row has been minted yet — either no prop or the
 *  `compose:email` sentinel. Drives the save button's label + which
 *  endpoint we hit on submit. */
const creating = computed(() =>
  !props.touchId || props.touchId.startsWith('compose:'),
);

// ── Server-side state ──────────────────────────────────────────────
// `loading` starts false — only flips true while a real touchId is
// being fetched. Create mode never sets it.
const loading = ref(false);
const original = ref<EmailComposition | null>(null);
const fetchErr = ref<string | null>(null);

// ── Form state ─────────────────────────────────────────────────────
// In create mode, these starting values double as the empty-form
// defaults (no extra hydrate step needed). Edit mode overwrites them
// in loadTouch().
const subject = ref('');
const previewText = ref('');
const body = ref('');
const cta = ref<EmailCTA | ''>('');
// Recipients picker is mutex: the user picks EITHER a mailing list OR an
// audience segment. The two refs are kept independent on the form so the
// previously-typed value survives a tab switch — only the "active" side
// is persisted on save. See `save()` for the mutex enforcement.
const recipientsMode = ref<'mailing_list' | 'audience_segment'>('audience_segment');
const mailingListId = ref<number | null>(null);
const audienceFilter = ref<AudienceFilter>('all');
const scheduledAt = ref(
  format(roundToNearestMinutes(addHours(new Date(), 1), { nearestTo: 15 }), "yyyy-MM-dd'T'HH:mm"),
);
// Create mode starts as a draft — the user actively opts into scheduling
// by unticking the checkbox. Edit mode reflects the row's status.
const isDraft = ref(true);
const isSubmitting = ref(false);

// ── Audience segment options (from AudienceFilter type) ─────────────
// v1: hard-coded literals + a free-text `cluster:<label>` fallback.
// Per-segment variant forking is deferred to a later phase
// (EmailComposition.variants stays null in 3.3).
interface AudienceOption { label: string; value: AudienceFilter; description?: string }
const AUDIENCE_OPTIONS: AudienceOption[] = [
  { label: 'All contacts', value: 'all', description: 'Every contact in your CRM' },
  { label: 'Opened previously', value: 'opened_previous', description: 'Engaged in past sends' },
  { label: 'Unopened previously', value: 'unopened_previous', description: 'Re-engagement candidates' },
];

const CTA_OPTIONS: { label: string; value: EmailCTA }[] = [
  { label: 'Book a call', value: 'book_call' },
  { label: 'Reply', value: 'reply' },
  { label: 'View portfolio', value: 'view_portfolio' },
  { label: 'View case study', value: 'view_case_study' },
  { label: 'Reply with a question', value: 'reply_with_question' },
];

// ── Load row ───────────────────────────────────────────────────────
async function loadTouch(id: string) {
  loading.value = true;
  fetchErr.value = null;
  try {
    const comp = await fetchById(id);
    if (!comp || comp.kind !== 'email') {
      throw new Error(comp ? 'Composition is not an email' : 'Email not found');
    }
    original.value = comp;
    subject.value = comp.subject;
    previewText.value = comp.preview_text ?? '';
    body.value = comp.body;
    cta.value = comp.cta ?? '';
    // Hydrate the recipients picker from whichever target shape the
    // touch has. List takes priority — mailing_list FK is the more
    // specific signal and the send path treats it as such.
    const listTarget = comp.targets.find((t) => t.kind === 'mailing_list');
    const segmentTarget = comp.targets.find((t) => t.kind === 'audience_segment');
    if (listTarget) {
      recipientsMode.value = 'mailing_list';
      mailingListId.value = Number(listTarget.list_id);
    } else if (segmentTarget) {
      recipientsMode.value = 'audience_segment';
      audienceFilter.value = segmentTarget.filter;
    }
    isDraft.value = comp.status === 'draft';
    if (comp.scheduled_at) {
      const d = new Date(comp.scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        scheduledAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
  } catch (err: any) {
    fetchErr.value = err?.message || 'Could not load email';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.touchId,
  (next) => {
    // Create mode — no fetch. Empty form refs already hold the defaults.
    if (!next || next.startsWith('compose:')) {
      loading.value = false;
      return;
    }
    // Post-create swap: the canvas replaces `compose:email` with the
    // real `touch:<n>` id once create() returns. Skip the refetch when
    // the id matches the row we just minted — otherwise we'd race the
    // POST round-trip and clobber the form state.
    if (original.value?.id === next) return;
    loadTouch(next);
  },
  { immediate: true },
);

/**
 * Build the single `CompositionTarget` to persist on save. Mutex is
 * enforced here — the picker keeps both the mailing_list and
 * audience_segment ref values around as the user toggles tabs, but only
 * the active tab's value is written. Returns null when the active tab is
 * mailing_list but no list has been picked (gates save).
 */
function buildTargetForSave():
  | { kind: 'mailing_list'; list_id: string; list_name: string }
  | { kind: 'audience_segment'; filter: AudienceFilter }
  | null {
  if (recipientsMode.value === 'mailing_list') {
    if (mailingListId.value == null) return null;
    const list = mailingLists.value.find((l) => l.id === mailingListId.value);
    return {
      kind: 'mailing_list',
      list_id: String(mailingListId.value),
      list_name: list?.name || `List ${mailingListId.value}`,
    };
  }
  return { kind: 'audience_segment', filter: audienceFilter.value };
}

// ── Mailing-list fetch ─────────────────────────────────────────────
// Org-scoped list of mailing_lists for the picker. Fetched once per
// composer mount; the org doesn't change while a composer is open.
interface MailingListLite {
  id: number;
  name: string;
  subscriber_count: number | null;
  is_default: boolean | null;
}
const mailingLists = ref<MailingListLite[]>([]);
const mailingListsLoading = ref(false);

async function loadMailingLists() {
  if (!selectedOrg.value) return;
  mailingListsLoading.value = true;
  try {
    const res = await $fetch<{ data: MailingListLite[] }>(
      '/api/marketing/mailing-lists',
      { query: { organizationId: selectedOrg.value }, credentials: 'include' },
    );
    mailingLists.value = res.data || [];
  } catch (err) {
    console.warn('[email-composer] mailing-lists fetch failed', err);
    mailingLists.value = [];
  } finally {
    mailingListsLoading.value = false;
  }
}

onMounted(() => {
  loadMailingLists();
});

const mailingListOptions = computed(() =>
  mailingLists.value.map((l) => ({
    label: l.subscriber_count
      ? `${l.name} — ${l.subscriber_count} subscriber${l.subscriber_count === 1 ? '' : 's'}`
      : l.name,
    value: l.id,
  })),
);

const selectedListLabel = computed(() => {
  if (mailingListId.value == null) return '';
  const list = mailingLists.value.find((l) => l.id === mailingListId.value);
  if (!list) return '';
  const count = list.subscriber_count ?? 0;
  return `${count} active subscriber${count === 1 ? '' : 's'} will receive this send.`;
});

const subjectCount = computed(() => subject.value.length);
const previewCount = computed(() => previewText.value.length);
const bodyCount = computed(() => body.value.length);

const canSubmit = computed(() => {
  // Create mode skips the original.value guard; edit mode still
  // requires it so we don't PATCH against a row we never loaded.
  if (!creating.value && !original.value) return false;
  if (creating.value && !selectedOrg.value) return false;
  if (!subject.value.trim()) return false;
  if (!body.value.trim()) return false;
  if (subjectCount.value > 998) return false;
  if (previewCount.value > 300) return false;
  if (bodyCount.value > 50_000) return false;
  // Recipients: mailing-list mode requires a picked list. Segment mode
  // always has a value (radio default = 'all').
  if (recipientsMode.value === 'mailing_list' && mailingListId.value == null) {
    return false;
  }
  return true;
});

// ── Save ─────────────────────────────────────────────────────────
async function save() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  const scheduledISO = new Date(scheduledAt.value).toISOString();
  const status: 'draft' | 'scheduled' = isDraft.value ? 'draft' : 'scheduled';
  try {
    if (creating.value) {
      // P3.4 create path — POST /api/marketing/touches. Server's
      // one-off-campaign helper mints the parent campaign when
      // `plan_id` is null (which it always is here; campaign
      // selection is a later phase).
      const orgId = selectedOrg.value;
      if (!orgId) throw new Error('No organization selected');
      const target = buildTargetForSave();
      if (!target) throw new Error('Pick a mailing list or audience segment');
      const result = await create({
        kind: 'email',
        organization: orgId,
        scheduled_at: scheduledISO,
        status,
        subject: subject.value.trim(),
        preview_text: previewText.value.trim() || null,
        body: body.value,
        cta: (cta.value || null) as EmailCTA | null,
        targets: [target],
        variants: null,
        plan_id: null,
      });
      if (result.kind !== 'email') {
        throw new Error('Unexpected non-email response from create()');
      }
      original.value = result;
      emit('created', result);
      toast.add({
        title: status === 'scheduled' ? 'Email scheduled' : 'Draft created',
        icon: 'i-lucide-check-circle',
        color: 'green',
      });
      return;
    }
    if (!original.value) return;
    const target = buildTargetForSave();
    if (!target) throw new Error('Pick a mailing list or audience segment');
    const patch: Extract<CompositionPatch, { kind: 'email' }> = {
      kind: 'email',
      subject: subject.value.trim(),
      preview_text: previewText.value.trim() || null,
      body: body.value,
      cta: (cta.value || null) as EmailCTA | null,
      targets: [target],
      status,
    };
    // Drafts keep their scheduled_at as a target time the user can
    // still edit — don't clobber on save.
    patch.scheduled_at = scheduledISO;
    const refreshed = (await update(original.value.source, patch)) as EmailComposition;
    if (refreshed.kind === 'email') {
      emit('saved', refreshed);
      original.value = refreshed;
    }
    toast.add({
      title: isDraft.value ? 'Draft saved' : 'Email scheduled',
      icon: 'i-lucide-check-circle',
      color: 'green',
    });
  } catch (err: any) {
    toast.add({
      title: 'Could not save',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section
    class="composer-surface composer-surface--email"
    role="dialog"
    aria-modal="false"
    aria-label="Edit email"
    @click.stop
  >
    <header class="composer-surface__header">
      <div class="flex items-center gap-2 min-w-0">
        <button
          type="button"
          class="composer-surface__back"
          @click="emit('close')"
        >
          <Icon name="lucide:chevron-left" class="w-4 h-4" />
          <span>Back to lifted</span>
        </button>
        <span class="composer-surface__pill">
          <Icon name="lucide:mail" class="w-3.5 h-3.5" />
          Email
        </span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <UButton
          @click="save"
          :loading="isSubmitting"
          :disabled="!canSubmit"
          size="sm"
          :icon="isDraft ? 'i-lucide-save' : 'i-lucide-calendar-clock'"
        >
          {{
            creating
              ? isDraft ? 'Create Draft' : 'Create & Schedule'
              : isDraft ? 'Save Draft' : 'Save & Schedule'
          }}
        </UButton>
      </div>
    </header>

    <div v-if="loading" class="composer-surface__loader">
      <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
      <p class="text-xs text-muted-foreground">Loading email…</p>
    </div>

    <div v-else-if="fetchErr" class="composer-surface__error">
      <Icon name="lucide:alert-circle" class="w-6 h-6 text-rose-500" />
      <p class="text-sm text-foreground">{{ fetchErr }}</p>
      <UButton size="sm" variant="soft" @click="emit('close')">Close</UButton>
    </div>

    <div v-else class="composer-surface__body">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Subject</h2>
            <span
              class="text-[11px] tabular-nums"
              :class="subjectCount > 998 ? 'text-rose-500' : 'text-muted-foreground'"
            >
              {{ subjectCount }} / 998
            </span>
          </div>
        </template>
        <UInput
          v-model="subject"
          placeholder="What's the email about?"
          size="lg"
        />
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Preview Text</h2>
            <span
              class="text-[11px] tabular-nums"
              :class="previewCount > 300 ? 'text-rose-500' : 'text-muted-foreground'"
            >
              {{ previewCount }} / 300
            </span>
          </div>
        </template>
        <UInput
          v-model="previewText"
          placeholder="Optional — shown next to the subject in the inbox"
        />
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Body</h2>
            <span
              class="text-[11px] tabular-nums"
              :class="bodyCount > 50_000 ? 'text-rose-500' : 'text-muted-foreground'"
            >
              {{ bodyCount }} chars
            </span>
          </div>
        </template>
        <UTextarea
          v-model="body"
          :rows="14"
          placeholder="Markdown supported — # headings, **bold**, [links](https://...)"
          class="font-mono text-sm"
        />
        <p class="mt-2 text-[11px] text-muted-foreground">
          Markdown is rendered on send. Use plain prose for short, conversational notes.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold text-gray-900 dark:text-white">Recipients</h2>
        </template>
        <div class="space-y-3">
          <!-- Segmented control switches the picker shape; mutex is
               enforced on save (buildTargetForSave). Both tabs preserve
               their state across switches so a user can experiment. -->
          <div
            class="inline-flex p-0.5 rounded-lg bg-muted/60 text-xs font-medium"
            role="tablist"
            aria-label="Recipients picker"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="recipientsMode === 'mailing_list'"
              class="composer-tab"
              :class="{ 'composer-tab--active': recipientsMode === 'mailing_list' }"
              @click="recipientsMode = 'mailing_list'"
            >
              <Icon name="lucide:list" class="w-3.5 h-3.5" />
              Mailing list
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="recipientsMode === 'audience_segment'"
              class="composer-tab"
              :class="{ 'composer-tab--active': recipientsMode === 'audience_segment' }"
              @click="recipientsMode = 'audience_segment'"
            >
              <Icon name="lucide:filter" class="w-3.5 h-3.5" />
              Audience segment
            </button>
          </div>

          <!-- Mailing-list tab. Empty state nudges the user to /lists
               (the canonical management surface) — inline creation is a
               v2 ergonomic. -->
          <div v-if="recipientsMode === 'mailing_list'" class="space-y-2">
            <div v-if="mailingListsLoading" class="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
              Loading lists…
            </div>
            <div
              v-else-if="mailingLists.length === 0"
              class="flex items-center gap-2 p-3 rounded-lg border border-dashed text-xs text-muted-foreground"
            >
              <Icon name="lucide:info" class="w-4 h-4 shrink-0" />
              <p class="flex-1">
                No mailing lists yet.
                <NuxtLink to="/lists" class="underline hover:text-foreground">Create one in Lists →</NuxtLink>
              </p>
            </div>
            <USelect
              v-else
              v-model="mailingListId"
              :options="mailingListOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Pick a mailing list"
            />
            <p v-if="mailingListId != null && selectedListLabel" class="text-[11px] text-muted-foreground">
              {{ selectedListLabel }}
            </p>
          </div>

          <!-- Audience-segment tab. Same options as the pre-tab version,
               still wired against the AudienceFilter literal. Note: for
               canvas-created one-off emails, segments resolve against
               the parent campaign's audience_snapshot which is null —
               so segment-targeted sends currently SKIP at delivery. The
               Mailing list tab is the only path that actually delivers
               recipients today. -->
          <div v-else class="space-y-2">
            <label
              v-for="opt in AUDIENCE_OPTIONS"
              :key="opt.value"
              class="flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors"
              :class="
                audienceFilter === opt.value
                  ? 'bg-primary/10 border border-primary/30'
                  : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
              "
            >
              <input
                type="radio"
                name="audience"
                :value="opt.value"
                v-model="audienceFilter"
                class="mt-0.5"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ opt.label }}</p>
                <p v-if="opt.description" class="text-[11px] text-muted-foreground mt-0.5">
                  {{ opt.description }}
                </p>
              </div>
            </label>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Call to Action</h2>
            <span class="text-xs text-muted-foreground">Optional</span>
          </div>
        </template>
        <USelect
          v-model="cta"
          :options="[{ label: 'No CTA', value: '' }, ...CTA_OPTIONS]"
          option-attribute="label"
          value-attribute="value"
        />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold text-gray-900 dark:text-white">Schedule</h2>
        </template>
        <div class="space-y-3">
          <UInput v-model="scheduledAt" type="datetime-local" />
          <UCheckbox v-model="isDraft" label="Save as draft (won't send)" />
        </div>
      </UCard>
    </div>
  </section>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.composer-surface {
  @apply flex flex-col w-full max-w-3xl mx-auto rounded-2xl border border-border
    bg-card shadow-2xl overflow-hidden;
  max-height: min(86vh, 900px);
  will-change: transform, opacity;
}

.composer-surface--email {
  --email-hue: 270;
}

.composer-surface__header {
  @apply flex items-center justify-between gap-3 px-4 py-3
    border-b border-border bg-card/95 backdrop-blur-md;
  position: sticky;
  top: 0;
  z-index: 1;
}

.composer-surface__back {
  @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full
    text-xs font-medium text-muted-foreground bg-muted/40
    hover:text-foreground hover:bg-muted transition-colors;
}

.composer-surface__pill {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wider text-white;
  background: linear-gradient(
    135deg,
    hsl(var(--email-hue) 55% 55%) 0%,
    hsl(var(--email-hue) 60% 42%) 100%
  );
}

.composer-surface__loader,
.composer-surface__error {
  @apply flex flex-col items-center justify-center gap-3 py-16;
}

.composer-surface__body {
  @apply flex flex-col gap-4 px-4 py-5 overflow-y-auto;
}

.composer-tab {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
    text-muted-foreground transition-colors;
}

.composer-tab:hover {
  @apply text-foreground;
}

.composer-tab--active {
  @apply bg-card text-foreground shadow-sm;
}
</style>
