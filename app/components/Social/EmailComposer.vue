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
 * Fields: subject, preview text, body (HTML via FormTiptap since P4.3
 * Item C — Tiptap's `getHTML()` round-trips through
 * `marketing_touches.email_body_html`), audience segment, CTA, schedule.
 * Save routes through `useComposition().update`
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
  CompositionTarget,
  EmailBodyVariant,
} from '~~/shared/composition';
import { targetKeyOf, normalizeBodyVariants } from '~~/shared/composition';
import type {
  EmailCTA,
  AudienceFilter,
} from '~~/shared/marketing-persistence';

/** Local alias — the email-side of CompositionTarget (lists + segments). */
type EmailTarget = Extract<
  CompositionTarget,
  { kind: 'mailing_list' } | { kind: 'audience_segment' }
>;

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
// P4 Item A.1: multi-target Recipients. The composer now holds a list of
// targets (mix of mailing lists + audience segments). Each target is a
// "chip" in the recipients row; the user can add more via the picker
// below the chip row and remove via the chip's × button.
const targets = ref<EmailTarget[]>([]);
// Picker scratch state — separate from `targets` so the previously-picked
// value survives a tab switch. Cleared after a successful "+ Add".
const pickerMode = ref<'mailing_list' | 'audience_segment'>('mailing_list');
const pickerListId = ref<number | null>(null);
const pickerSegment = ref<AudienceFilter>('all');

// P4 Item A.2: per-target subject + body variants. Keyed by
// `targetKeyOf(target)`. Lanes are stored as a complete shape (subject
// always defined, body_html always defined — P4.3 Item C) — the save
// handler normalizes against master before writing so lanes matching
// master collapse out. Empty record + no master diffs = column stays NULL.
const variantLanes = ref<Record<string, EmailBodyVariant>>({});
// Which target row is open for editing in the disclosure (null = no
// disclosure open). Mutex — editing one lane at a time matches the
// composer's "one thing on screen" principle from the canvas.
const editingTargetKey = ref<string | null>(null);
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
    // Hydrate the chip row from the full targets array. P4.2 (single-target)
    // rows surface as a single chip; P4.1 multi-target rows surface as
    // multiple chips in junction-sort order.
    targets.value = comp.targets.map((t) => {
      if (t.kind === 'mailing_list') {
        return { kind: 'mailing_list', list_id: t.list_id, list_name: t.list_name };
      }
      return { kind: 'audience_segment', filter: t.filter };
    });
    // P4 Item A.2 — hydrate per-target variants. Server returns the
    // normalized shape (only forked lanes present); we reconstitute the
    // full shape for in-memory editing (subject inherits master if the
    // saved lane only forked the body, etc).
    const masterSubject = comp.subject;
    const masterBody = comp.body;
    const incomingVariants = (comp.variants ?? {}) as Partial<Record<string, EmailBodyVariant>>;
    const reconstituted: Record<string, EmailBodyVariant> = {};
    for (const [key, lane] of Object.entries(incomingVariants)) {
      if (!lane) continue;
      // P4.3 Item C: lanes carry `body_html`. Legacy `body_markdown` is
      // pre-rendered to HTML by the adapter's normalizeLaneForRead, so
      // this branch always sees html in `lane.body_html`. We seed the
      // full shape (subject inherits master if the lane only forked the
      // body, etc).
      reconstituted[key] = {
        subject: lane.subject ?? masterSubject,
        body_html: lane.body_html ?? masterBody,
      };
    }
    variantLanes.value = reconstituted;
    editingTargetKey.value = null;
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

/** Tagger chip-row helpers (P4 Item A.1). */
function chipLabelFor(t: EmailTarget): string {
  if (t.kind === 'mailing_list') return t.list_name || `List ${t.list_id}`;
  const opt = AUDIENCE_OPTIONS.find((o) => o.value === t.filter);
  return opt?.label || t.filter;
}

function chipIconFor(t: EmailTarget): string {
  return t.kind === 'mailing_list' ? 'lucide:list' : 'lucide:filter';
}

/** Stable v-for key for a chip — uses kind + id/filter so two segment
 *  chips with different filters render independently and reordering a
 *  list-chip keeps its DOM node. */
function chipKey(t: EmailTarget, idx: number): string {
  if (t.kind === 'mailing_list') return `list:${t.list_id}:${idx}`;
  return `seg:${t.filter}:${idx}`;
}

function removeTarget(idx: number) {
  targets.value = targets.value.filter((_, i) => i !== idx);
}

function addMailingListTarget() {
  if (pickerListId.value == null) return;
  const id = pickerListId.value;
  // De-dupe: don't add the same list twice. Quiet no-op — the user can
  // see the existing chip already.
  if (targets.value.some((t) => t.kind === 'mailing_list' && Number(t.list_id) === id)) {
    pickerListId.value = null;
    return;
  }
  const list = mailingLists.value.find((l) => l.id === id);
  targets.value = [
    ...targets.value,
    {
      kind: 'mailing_list',
      list_id: String(id),
      list_name: list?.name || `List ${id}`,
    },
  ];
  pickerListId.value = null;
}

function addSegmentTarget() {
  const filter = pickerSegment.value;
  // De-dupe: don't add the same segment twice.
  if (targets.value.some((t) => t.kind === 'audience_segment' && t.filter === filter)) {
    return;
  }
  targets.value = [
    ...targets.value,
    { kind: 'audience_segment', filter },
  ];
}

// ── P4 Item A.2 helpers ────────────────────────────────────────────
function targetKeyForChip(t: EmailTarget): string {
  return targetKeyOf(t);
}

function isLaneForked(key: string): boolean {
  const lane = variantLanes.value[key];
  if (!lane) return false;
  return (
    (lane.subject !== undefined && lane.subject !== subject.value)
    || lane.body_html !== body.value
  );
}

/** Open the disclosure for editing this target's lane. Seeds the lane
 *  with master content if not already present so the editor inputs
 *  bind to a real lane object from the first keystroke. */
function editLane(key: string) {
  if (!variantLanes.value[key]) {
    variantLanes.value = {
      ...variantLanes.value,
      [key]: { subject: subject.value, body_html: body.value },
    };
  }
  editingTargetKey.value = editingTargetKey.value === key ? null : key;
}

function resetLaneToMaster(key: string) {
  const { [key]: _dropped, ...rest } = variantLanes.value;
  variantLanes.value = rest;
  if (editingTargetKey.value === key) editingTargetKey.value = null;
}

/** Two-way binding helpers so the template can `v-model="laneFieldFor(key, 'subject')"`. */
function laneSubject(key: string): string {
  return variantLanes.value[key]?.subject ?? subject.value;
}

function setLaneSubject(key: string, value: string) {
  const existing = variantLanes.value[key] ?? { subject: subject.value, body_html: body.value };
  variantLanes.value = {
    ...variantLanes.value,
    [key]: { ...existing, subject: value },
  };
}

function laneBody(key: string): string {
  return variantLanes.value[key]?.body_html ?? body.value;
}

function setLaneBody(key: string, value: string) {
  const existing = variantLanes.value[key] ?? { subject: subject.value, body_html: body.value };
  variantLanes.value = {
    ...variantLanes.value,
    [key]: { ...existing, body_html: value },
  };
}

/** Strip lanes for targets that have been removed from the chip row.
 *  Prevents zombie variants from clinging when the user adds a target,
 *  forks it, then removes the chip. */
function pruneOrphanLanes() {
  const liveKeys = new Set(targets.value.map(targetKeyForChip));
  const pruned: Record<string, EmailBodyVariant> = {};
  for (const [key, lane] of Object.entries(variantLanes.value)) {
    if (liveKeys.has(key)) pruned[key] = lane;
  }
  variantLanes.value = pruned;
}

watch(targets, pruneOrphanLanes, { deep: false });

/** Targets that have a forked (non-master) lane — used for the
 *  "n variants" pill on the disclosure header. */
const forkedLaneCount = computed(() =>
  Object.keys(variantLanes.value).filter((key) => isLaneForked(key)).length,
);

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

/** Helper: total subscriber count summed across all mailing-list targets
 *  (segment targets don't have a count surface). Returned as a short
 *  one-liner under the chip row. */
const recipientsSummary = computed(() => {
  if (targets.value.length === 0) return '';
  const listTargets = targets.value.filter((t): t is Extract<EmailTarget, { kind: 'mailing_list' }> => t.kind === 'mailing_list');
  const segmentCount = targets.value.length - listTargets.length;
  const subscriberSum = listTargets.reduce((sum, t) => {
    const list = mailingLists.value.find((l) => l.id === Number(t.list_id));
    return sum + (list?.subscriber_count ?? 0);
  }, 0);
  const parts: string[] = [];
  if (listTargets.length > 0) {
    parts.push(`${subscriberSum} subscriber${subscriberSum === 1 ? '' : 's'} from ${listTargets.length} list${listTargets.length === 1 ? '' : 's'}`);
  }
  if (segmentCount > 0) {
    parts.push(`${segmentCount} audience segment${segmentCount === 1 ? '' : 's'}`);
  }
  return parts.length > 1
    ? `${parts.join(' + ')} (deduped at send time)`
    : parts[0] || '';
});

const subjectCount = computed(() => subject.value.length);
const previewCount = computed(() => previewText.value.length);
const bodyCount = computed(() => body.value.length);
/** Tiptap returns `<p></p>` for an empty editor — the trimmed HTML is
 *  non-empty even when the user hasn't typed anything. Strip tags +
 *  collapse whitespace so the canSubmit guard rejects an unauthored
 *  body. Used only for the gate; the canvas always saves the raw HTML. */
const bodyHasContent = computed(() => {
  const stripped = body.value.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
  return stripped.length > 0;
});

const canSubmit = computed(() => {
  // Create mode skips the original.value guard; edit mode still
  // requires it so we don't PATCH against a row we never loaded.
  if (!creating.value && !original.value) return false;
  if (creating.value && !selectedOrg.value) return false;
  if (!subject.value.trim()) return false;
  if (!bodyHasContent.value) return false;
  if (subjectCount.value > 998) return false;
  if (previewCount.value > 300) return false;
  // P4.3 Item C: body is now HTML (Tiptap). The server schema caps
  // email_body_html at 200_000 chars to absorb markup overhead — the
  // visible-text fraction of that is still well within email-client
  // safe limits.
  if (bodyCount.value > 200_000) return false;
  // Recipients: at least one target. The tagger's empty state nudges the
  // user to pick something via the inline pickers below.
  if (targets.value.length === 0) return false;
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
      if (targets.value.length === 0) throw new Error('Pick at least one mailing list or audience segment');
      // P4 Item A.2: normalize variants against master before send.
      // Server re-normalizes authoritatively but we do it client-side
      // too so the on-wire payload is the minimum shape.
      const normalizedVariants = normalizeBodyVariants(
        variantLanes.value,
        subject.value.trim(),
        body.value,
      );
      const result = await create({
        kind: 'email',
        organization: orgId,
        scheduled_at: scheduledISO,
        status,
        subject: subject.value.trim(),
        preview_text: previewText.value.trim() || null,
        body: body.value,
        cta: (cta.value || null) as EmailCTA | null,
        // P4 Item A.1: send the full targets array (server persists to
        // marketing_touch_targets junction + mirrors first target into
        // back-compat columns).
        targets: targets.value,
        // P4 Item A.2: per-target subject + body variants (null when
        // no lanes diverge from master).
        variants: normalizedVariants,
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
    if (targets.value.length === 0) throw new Error('Pick at least one mailing list or audience segment');
    // P4 Item A.2: normalize variants against the just-edited master.
    const normalizedVariants = normalizeBodyVariants(
      variantLanes.value,
      subject.value.trim(),
      body.value,
    );
    const patch: Extract<CompositionPatch, { kind: 'email' }> = {
      kind: 'email',
      subject: subject.value.trim(),
      preview_text: previewText.value.trim() || null,
      body: body.value,
      cta: (cta.value || null) as EmailCTA | null,
      targets: targets.value,
      variants: normalizedVariants,
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
              :class="bodyCount > 200_000 ? 'text-rose-500' : 'text-muted-foreground'"
            >
              {{ bodyCount }} chars
            </span>
          </div>
        </template>
        <FormTiptap
          :model-value="body"
          :character-limit="0"
          :show-char-count="false"
          :allow-uploads="false"
          height="min-h-[260px] max-h-[420px]"
          custom-classes="px-4 py-3"
          @update:model-value="body = $event"
        />
        <p class="mt-2 text-[11px] text-muted-foreground">
          Rich text — bold, italic, lists, and links. Headings via the toolbar
          or <code class="text-[10px] bg-muted/40 px-1 rounded">#</code>
          shortcut. No tables or images in body — email clients render them
          inconsistently.
        </p>
      </UCard>

      <!-- P4 Item A.2 — Per-target variants. Hidden when targets.length
           is 0 or 1 (variants only deliver value with multi-target). -->
      <UCard v-if="targets.length > 1">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Icon name="lucide:git-branch" class="w-4 h-4 text-muted-foreground" />
              <h2 class="font-semibold text-gray-900 dark:text-white">Per-target variants</h2>
            </div>
            <span
              v-if="forkedLaneCount > 0"
              class="text-[11px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
            >
              {{ forkedLaneCount }} forked
            </span>
            <span v-else class="text-[11px] text-muted-foreground">
              All targets use the master
            </span>
          </div>
        </template>
        <div class="space-y-2">
          <p class="text-[11px] text-muted-foreground">
            Customize the subject or body for individual lists or segments.
            Targets not customized inherit the master.
          </p>
          <div
            v-for="t in targets"
            :key="targetKeyForChip(t)"
            class="composer-lane"
          >
            <div class="composer-lane__header">
              <span class="composer-tag" :class="t.kind === 'mailing_list' ? 'composer-tag--list' : 'composer-tag--segment'">
                <Icon :name="chipIconFor(t)" class="w-3.5 h-3.5" />
                <span class="truncate max-w-[200px]">{{ chipLabelFor(t) }}</span>
              </span>
              <span
                v-if="isLaneForked(targetKeyForChip(t))"
                class="text-[11px] text-primary font-medium inline-flex items-center gap-1"
              >
                <Icon name="lucide:git-branch" class="w-3 h-3" />
                Forked
              </span>
              <span v-else class="text-[11px] text-muted-foreground">
                Uses master
              </span>
              <div class="flex-1" />
              <button
                v-if="isLaneForked(targetKeyForChip(t))"
                type="button"
                class="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                @click="resetLaneToMaster(targetKeyForChip(t))"
              >
                Reset to master
              </button>
              <button
                type="button"
                class="text-[11px] font-medium text-primary hover:text-primary/80"
                @click="editLane(targetKeyForChip(t))"
              >
                {{ editingTargetKey === targetKeyForChip(t) ? 'Close' : 'Customize' }}
              </button>
            </div>
            <div
              v-if="editingTargetKey === targetKeyForChip(t)"
              class="composer-lane__editor"
            >
              <div class="space-y-1">
                <label class="composer-lane__label">Subject</label>
                <UInput
                  :model-value="laneSubject(targetKeyForChip(t))"
                  :placeholder="subject || 'Subject (inherits master)'"
                  @update:model-value="setLaneSubject(targetKeyForChip(t), String($event))"
                />
              </div>
              <div class="space-y-1">
                <label class="composer-lane__label">Body</label>
                <FormTiptap
                  :model-value="laneBody(targetKeyForChip(t))"
                  :character-limit="0"
                  :show-char-count="false"
                  :allow-uploads="false"
                  height="min-h-[180px] max-h-[320px]"
                  custom-classes="px-4 py-3"
                  @update:model-value="setLaneBody(targetKeyForChip(t), String($event))"
                />
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Recipients</h2>
            <span v-if="targets.length > 0" class="text-[11px] text-muted-foreground">
              {{ targets.length }} target{{ targets.length === 1 ? '' : 's' }}
            </span>
          </div>
        </template>
        <div class="space-y-3">
          <!-- Chip row — one chip per junction target. Empty state nudges
               toward the picker below. P4 Item A.1. -->
          <div v-if="targets.length === 0" class="composer-tag-empty">
            <Icon name="lucide:users" class="w-4 h-4 shrink-0" />
            <p class="flex-1">No recipients yet. Pick a mailing list or audience segment below.</p>
          </div>
          <div v-else class="composer-tag-row" role="list" aria-label="Recipient targets">
            <span
              v-for="(t, idx) in targets"
              :key="chipKey(t, idx)"
              role="listitem"
              class="composer-tag"
              :class="t.kind === 'mailing_list' ? 'composer-tag--list' : 'composer-tag--segment'"
            >
              <Icon :name="chipIconFor(t)" class="w-3.5 h-3.5" />
              <span class="truncate max-w-[180px]">{{ chipLabelFor(t) }}</span>
              <button
                type="button"
                class="composer-tag__remove"
                :aria-label="`Remove ${chipLabelFor(t)}`"
                @click="removeTarget(idx)"
              >
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </span>
          </div>

          <p v-if="recipientsSummary" class="text-[11px] text-muted-foreground">
            {{ recipientsSummary }}
          </p>

          <!-- Picker — segmented control switches the source, "+ Add"
               button appends a chip and resets the picker. Two tabs
               preserve their state across switches, matching P4.2. -->
          <div class="composer-picker">
            <div
              class="inline-flex p-0.5 rounded-lg bg-muted/60 text-xs font-medium"
              role="tablist"
              aria-label="Recipients picker source"
            >
              <button
                type="button"
                role="tab"
                :aria-selected="pickerMode === 'mailing_list'"
                class="composer-tab"
                :class="{ 'composer-tab--active': pickerMode === 'mailing_list' }"
                @click="pickerMode = 'mailing_list'"
              >
                <Icon name="lucide:list" class="w-3.5 h-3.5" />
                Mailing list
              </button>
              <button
                type="button"
                role="tab"
                :aria-selected="pickerMode === 'audience_segment'"
                class="composer-tab"
                :class="{ 'composer-tab--active': pickerMode === 'audience_segment' }"
                @click="pickerMode = 'audience_segment'"
              >
                <Icon name="lucide:filter" class="w-3.5 h-3.5" />
                Audience segment
              </button>
            </div>

            <!-- Mailing-list picker. Empty state nudges to /lists; same
                 as P4.2 — inline creation is a v2 ergonomic. -->
            <div v-if="pickerMode === 'mailing_list'" class="space-y-2">
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
                  <NuxtLink to="/lists" class="underline hover:text-foreground">Create one in Lists</NuxtLink>
                </p>
              </div>
              <div v-else class="flex items-center gap-2">
                <USelect
                  v-model="pickerListId"
                  :options="mailingListOptions"
                  option-attribute="label"
                  value-attribute="value"
                  placeholder="Pick a mailing list"
                  class="flex-1"
                />
                <UButton
                  size="sm"
                  variant="soft"
                  icon="i-lucide-plus"
                  :disabled="pickerListId == null"
                  @click="addMailingListTarget"
                >
                  Add
                </UButton>
              </div>
            </div>

            <!-- Audience-segment picker. Same options as P4.2. NOTE: for
                 canvas-created one-off emails, segment targets still
                 resolve against the parent campaign's audience_snapshot
                 which is null — so segment-only sends SKIP at delivery
                 unless paired with at least one mailing list in the
                 multi-target row. The mailing-list path is what actually
                 delivers recipients today. -->
            <div v-else class="space-y-2">
              <div class="space-y-1">
                <label
                  v-for="opt in AUDIENCE_OPTIONS"
                  :key="opt.value"
                  class="flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                  :class="
                    pickerSegment === opt.value
                      ? 'bg-primary/10 border border-primary/30'
                      : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                  "
                >
                  <input
                    type="radio"
                    name="picker-audience"
                    :value="opt.value"
                    v-model="pickerSegment"
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
              <div class="flex justify-end">
                <UButton
                  size="sm"
                  variant="soft"
                  icon="i-lucide-plus"
                  @click="addSegmentTarget"
                >
                  Add segment
                </UButton>
              </div>
            </div>
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

/* P4 Item A.1 — tagger chip row. */
.composer-tag-row {
  @apply flex flex-wrap items-center gap-2;
}

.composer-tag {
  @apply inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
    text-xs font-medium border;
}

.composer-tag--list {
  @apply bg-primary/10 text-primary border-primary/30;
}

.composer-tag--segment {
  @apply bg-muted/60 text-foreground border-border;
}

.composer-tag__remove {
  @apply inline-flex items-center justify-center w-4 h-4 rounded-full
    text-current/70 hover:text-current hover:bg-black/10 dark:hover:bg-white/10
    transition-colors;
}

.composer-tag-empty {
  @apply flex items-center gap-2 p-3 rounded-lg border border-dashed
    text-xs text-muted-foreground;
}

.composer-picker {
  @apply space-y-3 pt-3 border-t border-border;
}

/* P4 Item A.2 — per-target variant lane row. */
.composer-lane {
  @apply rounded-lg border border-border bg-muted/20;
}

.composer-lane__header {
  @apply flex items-center gap-2 px-3 py-2;
}

.composer-lane__editor {
  @apply space-y-2 px-3 pb-3 border-t border-border;
}

.composer-lane__label {
  @apply text-[11px] font-medium uppercase tracking-wide text-muted-foreground;
}
</style>
