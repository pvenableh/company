<!--
  DirectorSlides — the "presentation" view of a Director's Office briefing.

  Same drafted plan as the outline view, re-staged as a designed, one-idea-per-
  slide deck the Director is walked through: cover → the briefing → the numbers →
  each proposed action (approve/skip inline) → minutes. Deliberately a fixed
  dark "boardroom projector" theme (independent of the app palette) so it reads
  as a presentation, not another panel.

  Propose-only: action slides emit approve/skip up to the parent, which runs the
  same executors as the outline. Steps are the SAME reactive objects, so a step
  approved here also shows approved in the outline.
-->
<script setup lang="ts">
type StepStatus = 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
interface Step { id: string; action_type: string; title: string; preview: any; status: StepStatus }

const props = defineProps<{
  subject: string | null;
  scopeLabel: string;
  intro: string;
  /** Crisp "TL;DR" takeaways shown as the succinct briefing slide. */
  points?: string[];
  finance: any | null;
  opportunity: any | null;
  clientRating: any | null;
  steps: Step[];
}>();

const emit = defineEmits<{ approve: [step: Step]; skip: [step: Step]; slide: [label: string] }>();

const fmtMoney = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const netClass = (n: number) => (Number(n) >= 0 ? 'text-emerald-300' : 'text-rose-300');

// A human title for the meeting subject.
const subjectTitle = computed(() => {
  const s = (props.subject || '').toLowerCase();
  return ({
    money: 'The Money', clients: 'Clients', projects: 'Projects',
    leads: 'Pipeline', proposals: 'Proposals', tickets: 'Support',
  } as Record<string, string>)[s] || (props.subject ? props.subject : 'Working Session');
});

function labelForType(t: string): string {
  return { create_tasks: 'Create tasks', update_field: 'Update', send_email: 'Send email', reschedule_project: 'Reschedule' }[t] || t;
}
function iconForType(t: string): string {
  return {
    create_tasks: 'i-lucide-list-plus', update_field: 'i-lucide-pencil',
    send_email: 'i-lucide-mail', reschedule_project: 'i-lucide-calendar-clock',
  }[t] || 'i-lucide-sparkles';
}
function ratingRing(r: string): string {
  return { A: 'text-emerald-300 ring-emerald-300/40', B: 'text-emerald-300 ring-emerald-300/30', C: 'text-amber-300 ring-amber-300/40', D: 'text-rose-300 ring-rose-300/40', F: 'text-rose-400 ring-rose-400/50' }[r] || 'text-slate-200 ring-white/20';
}

// ── Deck assembly ──────────────────────────────────────────────────────────
type Slide =
  | { kind: 'cover' }
  | { kind: 'takeaways' }
  | { kind: 'thought'; heading: string; body: string; n: number }
  | { kind: 'rating' }
  | { kind: 'metrics' }
  | { kind: 'opportunity' }
  | { kind: 'action'; step: Step; n: number }
  | { kind: 'summary' };

// Split the verbose briefing into subject "thoughts" so a long read spans
// several light slides instead of one crammed wall of text.
const narrativeChunks = computed<{ heading: string; body: string }[]>(() => {
  const raw = (props.intro || '').trim();
  if (!raw) return [];
  // Money / client briefings use "Label: text" lines — one slide per label.
  const labelRe = /^(Income|Expenses?|Prediction|Verdict|Opportunity|Wasted effort|Value|Effort|Health|Outlook)\s*:/i;
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const labeled = lines.filter((l) => labelRe.test(l));
  if (labeled.length >= 2) {
    return labeled.map((l) => {
      const m = l.match(labelRe)!;
      return { heading: m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1), body: l.slice(l.indexOf(':') + 1).trim() };
    });
  }
  // Otherwise split by paragraph (blank line) → one thought per paragraph.
  const paras = raw.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (paras.length > 1) return paras.map((p) => ({ heading: '', body: p }));
  // Single long block → ~2-sentence chunks so it isn't one dense slide.
  if (raw.length > 340) {
    const sentences = raw.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [raw];
    const chunks: { heading: string; body: string }[] = [];
    for (let i = 0; i < sentences.length; i += 2) chunks.push({ heading: '', body: sentences.slice(i, i + 2).join(' ').trim() });
    return chunks;
  }
  return [{ heading: '', body: raw }];
});

const slides = computed<Slide[]>(() => {
  const out: Slide[] = [{ kind: 'cover' }];
  const pts = props.points || [];
  const chunks = narrativeChunks.value;
  // Overview takeaways slide when the model gave us the TL;DR bullets.
  if (pts.length) out.push({ kind: 'takeaways' });
  // Detail thought-slides — skipped only when the single short chunk is already
  // covered by the takeaways overview.
  if (!(pts.length && chunks.length <= 1)) {
    chunks.forEach((c, i) => out.push({ kind: 'thought', heading: c.heading, body: c.body, n: i }));
  }
  if (props.clientRating) out.push({ kind: 'rating' });
  if (props.finance) out.push({ kind: 'metrics' });
  if (props.opportunity && (props.opportunity.topClients?.length || props.opportunity.pipeline?.openCount)) out.push({ kind: 'opportunity' });
  props.steps.forEach((s, i) => out.push({ kind: 'action', step: s, n: i + 1 }));
  if (props.steps.length) out.push({ kind: 'summary' });
  return out;
});

const index = ref(0);
const dir = ref<1 | -1>(1); // travel direction, drives the slide transition
const current = computed(() => slides.value[Math.min(index.value, slides.value.length - 1)]);
const atStart = computed(() => index.value <= 0);
const atEnd = computed(() => index.value >= slides.value.length - 1);

function next() { if (!atEnd.value) { dir.value = 1; index.value++; } }
function prev() { if (!atStart.value) { dir.value = -1; index.value--; } }
function goTo(i: number) {
  const target = Math.max(0, Math.min(i, slides.value.length - 1));
  dir.value = target >= index.value ? 1 : -1;
  index.value = target;
}

const rollup = computed(() => {
  const done = props.steps.filter((s) => s.status === 'executed').length;
  const skipped = props.steps.filter((s) => s.status === 'rejected').length;
  const failed = props.steps.filter((s) => s.status === 'failed').length;
  const open = props.steps.filter((s) => s.status === 'pending' || s.status === 'executing').length;
  return { done, skipped, failed, open, total: props.steps.length };
});

// Reset to the cover whenever a different briefing is loaded.
watch(() => `${props.subject}|${props.intro.slice(0, 40)}|${props.steps.length}`, () => { index.value = 0; dir.value = 1; });
// Keep the index valid if the deck shrinks.
watch(slides, (s) => { if (index.value > s.length - 1) index.value = Math.max(0, s.length - 1); });

// Report the current slide up to the overlay so "Ask Earnest" can resolve
// questions about "this slide".
function slideLabel(s: Slide | undefined): string {
  switch (s?.kind) {
    case 'cover': return 'the title slide';
    case 'takeaways': return 'the key takeaways slide';
    case 'thought': return s.heading ? `the "${s.heading}" point of the briefing` : 'the briefing detail';
    case 'rating': return 'the client rating slide';
    case 'metrics': return 'the money metrics slide';
    case 'opportunity': return 'the "where the money is" slide';
    case 'action': return `the proposed action "${s.step.title}"`;
    case 'summary': return 'the meeting minutes slide';
    default: return '';
  }
}
watch(current, (c) => emit('slide', slideLabel(c)), { immediate: true });

// Don't hijack the arrow keys while the user is typing in a field (e.g. the
// "Raise a topic" input that lives above the deck).
function typingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
onKeyStroke('ArrowRight', (e) => { if (typingInField()) return; e.preventDefault(); next(); });
onKeyStroke('ArrowLeft', (e) => { if (typingInField()) return; e.preventDefault(); prev(); });

// Full-screen presentation — the deck fills the display like a real slideshow.
// Native Fullscreen API when allowed; falls back to a fixed full-viewport
// overlay where it's blocked (e.g. a sandboxed preview iframe).
const deckRoot = ref<HTMLElement | null>(null);
const nativeFull = ref(false);
const fauxFull = ref(false);
const isFullscreen = computed(() => nativeFull.value || fauxFull.value);
function toggleFullscreen() {
  if (nativeFull.value || fauxFull.value) {
    if (document.fullscreenElement) document.exitFullscreen?.();
    fauxFull.value = false;
    return;
  }
  const el = deckRoot.value;
  const req = el?.requestFullscreen?.bind(el);
  if (req) req().catch(() => { fauxFull.value = true; });
  else fauxFull.value = true;
}
function onFsChange() { nativeFull.value = !!document.fullscreenElement; }
onMounted(() => document.addEventListener('fullscreenchange', onFsChange));
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFsChange));
</script>

<template>
  <div ref="deckRoot" class="director-deck relative rounded-2xl overflow-hidden select-none" :class="{ 'director-deck--faux-full': fauxFull }">
    <!-- Faint chair watermark -->
    <DirectorChairIcon class="director-deck__watermark absolute -right-6 -bottom-8 w-48 h-48 text-white/[0.04]" />

    <!-- Top strip: subject + slide counter -->
    <div class="relative flex items-center justify-between px-5 pt-4 text-[11px] uppercase tracking-[0.18em] text-white/45">
      <span class="inline-flex items-center gap-1.5">
        <DirectorChairIcon class="w-3.5 h-3.5 text-indigo-300" />
        <span class="text-white/75">{{ subjectTitle }}</span>
        <span class="text-white/40">presenting</span>
      </span>
      <span class="inline-flex items-center gap-2.5">
        {{ index + 1 }} / {{ slides.length }}
        <button
          type="button"
          class="text-white/45 hover:text-white/85 transition-colors"
          :aria-label="isFullscreen ? 'Exit full screen' : 'Present full screen'"
          @click="toggleFullscreen"
        >
          <UIcon :name="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" class="w-3.5 h-3.5" />
        </button>
      </span>
    </div>

    <!-- Slide stage -->
    <div class="director-deck__stage relative px-6 sm:px-9 py-6 flex flex-col justify-center">
      <Transition :name="dir === 1 ? 'deck-fwd' : 'deck-back'" mode="out-in">
        <!-- COVER -->
        <div :key="`cover-${index}`" v-if="current?.kind === 'cover'" class="text-center space-y-4">
          <div class="mx-auto w-16 h-16 rounded-2xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
            <DirectorChairIcon class="w-8 h-8 text-white" />
          </div>
          <div>
            <p class="text-[11px] uppercase tracking-[0.22em] text-indigo-300 mb-1">Reviewing {{ scopeLabel }}</p>
            <h2 class="text-3xl sm:text-4xl font-semibold text-white leading-tight">{{ subjectTitle }}</h2>
          </div>
          <p class="text-sm text-white/55 max-w-md mx-auto">
            Earnest AI reviewed the business and prepared the following. Nothing runs until you approve it — step through and decide.
          </p>
          <p class="text-[11px] text-white/35">Press → or use the arrows to begin</p>
        </div>

        <!-- TAKEAWAYS — the succinct TL;DR overview -->
        <div :key="`take-${index}`" v-else-if="current?.kind === 'takeaways'" class="space-y-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-indigo-300">Key takeaways</p>
          <ul class="space-y-3.5">
            <li v-for="(p, i) in (points || [])" :key="i" class="flex items-start gap-3 text-[17px] sm:text-lg leading-snug text-white/90">
              <span class="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0" />
              <span>{{ p }}</span>
            </li>
          </ul>
        </div>

        <!-- THOUGHT — one subject / paragraph of the briefing per slide -->
        <div :key="`thought-${index}`" v-else-if="current?.kind === 'thought'" class="space-y-3">
          <p class="text-[11px] uppercase tracking-[0.2em] text-indigo-300">{{ current.heading || 'The briefing' }}</p>
          <div class="director-deck__scroll text-[17px] sm:text-lg leading-relaxed text-white/90 whitespace-pre-line">{{ current.body }}</div>
        </div>

        <!-- CLIENT RATING -->
        <div :key="`rate-${index}`" v-else-if="current?.kind === 'rating' && clientRating" class="space-y-5">
          <p class="text-[11px] uppercase tracking-[0.2em] text-indigo-300">Account rating</p>
          <div class="flex items-center gap-4">
            <span class="w-16 h-16 rounded-full ring-2 flex items-center justify-center text-3xl font-bold bg-white/5" :class="ratingRing(clientRating.rating)">{{ clientRating.rating }}</span>
            <div>
              <p class="text-xl font-semibold text-white">{{ clientRating.clientName }}</p>
              <p class="text-sm text-white/50">Earnest's rating for this account</p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <p class="text-[10px] uppercase tracking-wider text-white/40">Value</p>
              <p class="text-lg font-semibold text-white">{{ fmtMoney(clientRating.value.revenue) }}</p>
              <p class="text-[11px] text-white/40">{{ clientRating.value.activeProjects }} active proj.</p>
            </div>
            <div class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <p class="text-[10px] uppercase tracking-wider text-white/40">Effort</p>
              <p class="text-lg font-semibold text-white">{{ clientRating.effort.total }}</p>
              <p class="text-[11px] text-white/40">touch-points</p>
            </div>
            <div class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <p class="text-[10px] uppercase tracking-wider text-white/40">Overdue AR</p>
              <p class="text-lg font-semibold" :class="clientRating.health.overdueAR > 0 ? 'text-rose-300' : 'text-white'">{{ fmtMoney(clientRating.health.overdueAR) }}</p>
              <p class="text-[11px] text-white/40">{{ clientRating.health.staleDays != null ? clientRating.health.staleDays + 'd since touch' : 'no activity' }}</p>
            </div>
          </div>
        </div>

        <!-- MONEY METRICS -->
        <div :key="`met-${index}`" v-else-if="current?.kind === 'metrics' && finance" class="space-y-5">
          <p class="text-[11px] uppercase tracking-[0.2em] text-indigo-300">By the numbers</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <p class="text-[10px] uppercase tracking-wider text-white/40">Income / mo</p>
              <p class="text-lg font-semibold text-white">{{ fmtMoney(finance.trailing.income) }}</p>
            </div>
            <div class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <p class="text-[10px] uppercase tracking-wider text-white/40">Expenses / mo</p>
              <p class="text-lg font-semibold text-white">{{ fmtMoney(finance.trailing.expenses) }}</p>
            </div>
            <div class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <p class="text-[10px] uppercase tracking-wider text-white/40">Net / mo</p>
              <p class="text-lg font-semibold" :class="netClass(finance.trailing.net)">{{ fmtMoney(finance.trailing.net) }}</p>
            </div>
            <div class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <p class="text-[10px] uppercase tracking-wider text-white/40">Outstanding AR</p>
              <p class="text-lg font-semibold text-white">{{ fmtMoney(finance.outstanding.total) }}</p>
              <p v-if="finance.outstanding.overdueTotal > 0" class="text-[11px] text-rose-300">{{ fmtMoney(finance.outstanding.overdueTotal) }} overdue</p>
            </div>
          </div>
          <div class="rounded-xl bg-indigo-500/15 ring-1 ring-indigo-300/25 p-3.5">
            <p class="text-[10px] uppercase tracking-wider text-indigo-200/80">Projected next {{ finance.projection.horizonMonths }} months (run-rate)</p>
            <p class="text-sm text-white/85 mt-0.5">
              Income {{ fmtMoney(finance.projection.income) }} · Expenses {{ fmtMoney(finance.projection.expenses) }} ·
              <span class="font-semibold" :class="netClass(finance.projection.net)">Net {{ fmtMoney(finance.projection.net) }}</span>
            </p>
          </div>
        </div>

        <!-- OPPORTUNITY -->
        <div :key="`opp-${index}`" v-else-if="current?.kind === 'opportunity' && opportunity" class="space-y-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-indigo-300">Where the money is</p>
          <div v-if="opportunity.topClients?.length" class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3.5">
            <p class="text-[10px] uppercase tracking-wider text-white/40 mb-1">Top clients</p>
            <p class="text-[15px] text-white/85">{{ opportunity.topClients.slice(0, 3).map((c: any) => `${c.name} · ${fmtMoney(c.revenue)}`).join('  —  ') }}</p>
          </div>
          <div v-if="opportunity.topServiceLines?.length" class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3.5">
            <p class="text-[10px] uppercase tracking-wider text-white/40 mb-1">Best lines</p>
            <p class="text-[15px] text-white/85">{{ opportunity.topServiceLines.slice(0, 3).map((s: any) => `${s.name} · ${fmtMoney(s.revenue)}`).join('  —  ') }}</p>
          </div>
          <div v-if="opportunity.pipeline?.openCount" class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3.5">
            <p class="text-[10px] uppercase tracking-wider text-white/40 mb-1">Pipeline</p>
            <p class="text-[15px] text-white/85">{{ opportunity.pipeline.openCount }} open · ~{{ fmtMoney(opportunity.pipeline.weightedValue) }} weighted</p>
          </div>
        </div>

        <!-- ACTION -->
        <div :key="`act-${index}`" v-else-if="current?.kind === 'action'" class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-[11px] uppercase tracking-[0.2em] text-indigo-300">Proposed action {{ current.n }} of {{ steps.length }}</p>
            <span class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/70">
              <UIcon :name="iconForType(current.step.action_type)" class="w-3 h-3" />
              {{ labelForType(current.step.action_type) }}
            </span>
          </div>
          <h3 class="text-2xl font-semibold text-white leading-snug">{{ current.step.title }}</h3>

          <div v-if="current.step.action_type === 'send_email' && current.step.preview" class="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 text-sm text-white/70 space-y-0.5">
            <p><span class="text-white/45">To:</span> {{ current.step.preview.to || 'contact' }}</p>
            <p><span class="text-white/45">Subject:</span> {{ current.step.preview.subject }}</p>
          </div>

          <!-- Decided states -->
          <p v-if="current.step.status === 'executed'" class="inline-flex items-center gap-1.5 text-sm text-emerald-300"><UIcon name="i-lucide-check-circle" class="w-4 h-4" /> Approved · done</p>
          <p v-else-if="current.step.status === 'rejected'" class="inline-flex items-center gap-1.5 text-sm text-white/40"><UIcon name="i-lucide-slash" class="w-4 h-4" /> Skipped</p>
          <p v-else-if="current.step.status === 'failed'" class="inline-flex items-center gap-1.5 text-sm text-rose-300"><UIcon name="i-lucide-alert-triangle" class="w-4 h-4" /> Failed — try it manually</p>

          <!-- Decision -->
          <div v-else class="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full bg-white text-slate-900 hover:bg-white/90 disabled:opacity-50"
              :disabled="current.step.status === 'executing'"
              @click="emit('approve', current.step)"
            >
              <UIcon v-if="current.step.status === 'executing'" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
              <UIcon v-else name="i-lucide-check" class="w-4 h-4" />
              Approve
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full ring-1 ring-white/20 text-white/70 hover:text-white hover:ring-white/40 disabled:opacity-50"
              :disabled="current.step.status === 'executing'"
              @click="emit('skip', current.step)"
            >
              Skip
            </button>
          </div>
        </div>

        <!-- SUMMARY -->
        <div :key="`sum-${index}`" v-else-if="current?.kind === 'summary'" class="text-center space-y-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-indigo-300">Meeting minutes</p>
          <div class="flex items-center justify-center gap-6">
            <div><p class="text-3xl font-semibold text-emerald-300">{{ rollup.done }}</p><p class="text-[11px] uppercase tracking-wider text-white/40">Approved</p></div>
            <div><p class="text-3xl font-semibold text-white/70">{{ rollup.skipped }}</p><p class="text-[11px] uppercase tracking-wider text-white/40">Skipped</p></div>
            <div v-if="rollup.failed"><p class="text-3xl font-semibold text-rose-300">{{ rollup.failed }}</p><p class="text-[11px] uppercase tracking-wider text-white/40">Failed</p></div>
            <div v-if="rollup.open"><p class="text-3xl font-semibold text-indigo-300">{{ rollup.open }}</p><p class="text-[11px] uppercase tracking-wider text-white/40">Open</p></div>
          </div>
          <p class="text-sm text-white/55 max-w-sm mx-auto">
            {{ rollup.open ? 'Some actions are still open — step back to decide on them.' : 'That’s the session. Approved actions have been carried out.' }}
          </p>
        </div>
      </Transition>
    </div>

    <!-- Controls -->
    <div class="relative flex items-center justify-between px-5 pb-4 pt-1">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-white/55 hover:text-white disabled:opacity-30 disabled:cursor-default"
        :disabled="atStart"
        @click="prev"
      >
        <UIcon name="i-lucide-chevron-left" class="w-4 h-4" /> Prev
      </button>

      <div class="flex items-center gap-1.5">
        <button
          v-for="(s, i) in slides"
          :key="i"
          type="button"
          class="rounded-full transition-all"
          :class="i === index ? 'w-5 h-1.5 bg-indigo-300' : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/50'"
          :aria-label="`Go to slide ${i + 1}`"
          @click="goTo(i)"
        />
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-white/55 hover:text-white disabled:opacity-30 disabled:cursor-default"
        :disabled="atEnd"
        @click="next"
      >
        Next <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Fixed dark "boardroom projector" theme — intentionally palette-independent so
   the deck reads as a presentation regardless of the app's light/dark mode. */
.director-deck {
  background:
    radial-gradient(120% 120% at 15% 0%, rgba(99, 102, 241, 0.22) 0%, transparent 45%),
    linear-gradient(160deg, #10152b 0%, #0f1225 55%, #171233 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 20px 40px -20px rgba(0, 0, 0, 0.6);
}
.director-deck__stage {
  min-height: 340px;
}
@media (min-width: 640px) {
  .director-deck__stage { min-height: 400px; }
}
/* Full-screen presentation — fill the display and centre the stage. Applies to
   both native `:fullscreen` and the faux fixed-overlay fallback. */
.director-deck:fullscreen,
.director-deck--faux-full {
  border-radius: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.director-deck--faux-full {
  position: fixed;
  inset: 0;
  z-index: 100;
}
.director-deck:fullscreen .director-deck__stage,
.director-deck--faux-full .director-deck__stage {
  flex: 1;
  min-height: 0;
  justify-content: center;
}
.director-deck:fullscreen .director-deck__scroll,
.director-deck--faux-full .director-deck__scroll {
  max-height: 60vh;
}
.director-deck:fullscreen .director-deck__watermark,
.director-deck--faux-full .director-deck__watermark {
  width: 22rem;
  height: 22rem;
}
.director-deck__scroll {
  max-height: 300px;
  overflow-y: auto;
}
.director-deck__watermark {
  transform: rotate(-8deg);
  pointer-events: none;
}

/* Directional slide transitions — the deck feels like it travels forward when
   you hit Next and backward on Prev (the incoming/outgoing slides mirror). */
.deck-fwd-enter-active,
.deck-fwd-leave-active,
.deck-back-enter-active,
.deck-back-leave-active {
  transition: opacity 200ms ease, transform 260ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
/* Forward: new slide arrives from the right, old exits to the left. */
.deck-fwd-enter-from { opacity: 0; transform: translateX(26px); }
.deck-fwd-leave-to { opacity: 0; transform: translateX(-26px); }
/* Backward: mirror — new from the left, old exits to the right. */
.deck-back-enter-from { opacity: 0; transform: translateX(-26px); }
.deck-back-leave-to { opacity: 0; transform: translateX(26px); }
</style>
