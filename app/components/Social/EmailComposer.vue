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
    const segment = comp.targets.find((t) => t.kind === 'audience_segment');
    if (segment) audienceFilter.value = segment.filter;
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
      const result = await create({
        kind: 'email',
        organization: orgId,
        scheduled_at: scheduledISO,
        status,
        subject: subject.value.trim(),
        preview_text: previewText.value.trim() || null,
        body: body.value,
        cta: (cta.value || null) as EmailCTA | null,
        targets: [{ kind: 'audience_segment', filter: audienceFilter.value }],
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
    const patch: Extract<CompositionPatch, { kind: 'email' }> = {
      kind: 'email',
      subject: subject.value.trim(),
      preview_text: previewText.value.trim() || null,
      body: body.value,
      cta: (cta.value || null) as EmailCTA | null,
      targets: [{ kind: 'audience_segment', filter: audienceFilter.value }],
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
          <h2 class="font-semibold text-gray-900 dark:text-white">Audience</h2>
        </template>
        <div class="space-y-2">
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
</style>
