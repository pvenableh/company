<script setup lang="ts">
/**
 * <DocumentGenerativeCanvas> — the Document builder wired to the Generative
 * Canvas kernel. Speak a proposal's shape ("Acme, 3-month brand refresh, ~$18k,
 * phased") and Earnest drafts the typed blocks live — a rich-text intro, a
 * phased scope_tree — each rising into place, refined conversationally
 * ("drop phase 2's hours, we're fixed-fee"). Nothing is sent or signed; "Save"
 * creates an editable proposal DRAFT you finish + send from the workspace.
 *
 * Vocabulary is limited to the two block types that actually render today
 * (rich_text, scope_tree) — see shared/blocks/builtins.ts. The rest of the
 * typed-block union is reserved and would render as "Unsupported".
 */
import { toast } from 'vue-sonner';
import { marked } from 'marked';
import { useGenerativeCanvas } from '~/composables/useGenerativeCanvas';
import { useCanvasChoreography } from '~/composables/useCanvasChoreography';
import { newEntryId } from '~~/shared/blocks/normalize';
import type { DocumentBlockEntry } from '~~/shared/blocks/types';
import type { BlockKindSpec, CanvasBlock } from '~~/shared/canvas';

const props = defineProps<{
  /** Optional brief grounding the whole session. */
  brief?: string;
  /** Optional entity (e.g. the lead this proposal is for). */
  entity?: { type: string; id: string };
  /** Optional lead id to link the created proposal to. */
  leadId?: string | number;
  /**
   * Embedded mode: instead of creating a new proposal, seed the canvas with an
   * existing document's blocks and hand edited blocks back via @apply. The host
   * (e.g. ProposalWorkspace) owns persistence.
   */
  embedded?: boolean;
  /** Existing document blocks to seed the canvas with (embedded mode). */
  initialBlocks?: DocumentBlockEntry[];
}>();

const emit = defineEmits<{
  (e: 'apply', blocks: DocumentBlockEntry[]): void;
  (e: 'close'): void;
}>();

// ── Block vocabulary — ONLY the two types that render today ───────────────────
const DOCUMENT_BLOCK_KINDS: BlockKindSpec[] = [
  {
    kind: 'rich_text',
    label: 'Rich text',
    description:
      'A heading + prose section. Use for the opening/intro, an approach or about section, terms, or any narrative copy. Write real, on-brand markdown.',
    shape: '{ heading?: string, body_markdown: string (markdown — headings, bold, lists ok) }',
  },
  {
    kind: 'scope_tree',
    label: 'Scope (phased deliverables)',
    description:
      'Phased deliverables. Use for the scope of work: each phase has a heading, a short summary, bullet deliverables, and optional hours/fee. This is the heart of a proposal.',
    shape:
      '{ numbering_style?: "phase_word"|"phase_number"|"decimal"|"none", phases: { id: string (unique), heading: string, summary?: string, bullets?: string[], hours?: number, fee?: number, show_hours?: boolean, show_fee?: boolean }[] }',
  },
];

const presence = useEarnestPresence({ initial: 'present' });
const canvasEl = ref<HTMLElement | null>(null);
const choreo = useCanvasChoreography(canvasEl, { stagger: 0.08, rise: 20, entrance: 'rise' });

// In embedded mode, seed the canvas from the host document's existing blocks.
// The reverse adapter is trivial: CanvasBlock.data IS the typed payload.
const seededArtifact = props.embedded && props.initialBlocks?.length
  ? {
      blocks: props.initialBlocks.map((e) => ({
        id: e.id,
        kind: e.type,
        // Detach from the host record's (reactive) payload so canvas edits
        // never mutate the live proposal until the user Applies.
        data: JSON.parse(JSON.stringify(e.payload ?? {})) as Record<string, any>,
      })),
    }
  : undefined;

const canvas = useGenerativeCanvas({
  canvasKind: 'document',
  blockKinds: DOCUMENT_BLOCK_KINDS,
  presence,
  choreography: choreo,
  brief: props.brief,
  entity: props.entity,
  initial: seededArtifact,
});

const { blocks, messages, isStreaming, isDrafting, lastNote, error, artifact } = canvas;

// Editable title bound to the artifact.
const title = computed({
  get: () => artifact.value.title ?? '',
  set: (v: string) => { artifact.value = { ...artifact.value, title: v }; },
});

// ── Intent field ─────────────────────────────────────────────────────────────
const intent = ref('');
const SUGGESTIONS = [
  'A proposal for a 3-month brand refresh — an intro, a phased scope with fees, and a close.',
  'A website redesign proposal: discovery, design, build, launch — with hours per phase.',
  'A social media retainer proposal, fixed monthly fee, no hourly breakdown.',
  'A short one-phase proposal for a logo and brand guidelines.',
];

function submitIntent() {
  const text = intent.value.trim();
  if (!text || isStreaming.value) return;
  intent.value = '';
  canvas.sendIntent(text);
}
function runSuggestion(text: string) {
  if (isStreaming.value) return;
  canvas.sendIntent(text);
}
function onIntentKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitIntent(); }
}

// ── Block-card helpers ───────────────────────────────────────────────────────
function renderMarkdown(md: string): string {
  if (!md) return '';
  try { return marked.parse(md, { async: false, gfm: true, breaks: true }) as string; }
  catch { return `<p>${md}</p>`; }
}
function phases(block: CanvasBlock): any[] {
  return Array.isArray(block.data?.phases) ? block.data.phases : [];
}
function money(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toLocaleString()}` : '';
}

// ── Persist as a proposal draft ──────────────────────────────────────────────
const { createProposal } = useProposals();
const proposalItems = useDirectusItems('proposals');
const router = useRouter();
const saving = ref(false);

/** Map the generic canvas blocks to typed DocumentBlockEntry[]. */
function toEntries(): DocumentBlockEntry[] {
  return blocks.value.map((b) => {
    if (b.kind === 'scope_tree') {
      const rawPhases = Array.isArray(b.data?.phases) ? b.data.phases : [];
      const cleaned = rawPhases.map((p: any) => ({
        id: p?.id || newEntryId(),
        heading: p?.heading ?? '',
        summary: p?.summary ?? null,
        bullets: Array.isArray(p?.bullets) ? p.bullets : undefined,
        hours: p?.hours ?? null,
        fee: p?.fee ?? null,
        deliverables: Array.isArray(p?.deliverables) ? p.deliverables : undefined,
        show_hours: p?.show_hours ?? (p?.hours != null),
        show_fee: p?.show_fee ?? (p?.fee != null),
        show_deliverables: p?.show_deliverables ?? (Array.isArray(p?.deliverables) && p.deliverables.length > 0),
      }));
      return {
        id: b.id,
        type: 'scope_tree',
        payload: { numbering_style: b.data?.numbering_style || 'phase_word', phases: cleaned },
        library_ref: null,
        page_break_after: false,
      };
    }
    return {
      id: b.id,
      type: 'rich_text',
      payload: { heading: b.data?.heading ?? '', body_markdown: b.data?.body_markdown ?? '' },
      library_ref: null,
      page_break_after: false,
    };
  });
}

async function saveDraft() {
  if (!blocks.value.length || saving.value) return;
  saving.value = true;
  try {
    const created = await createProposal({
      title: title.value.trim() || 'Untitled proposal',
      lead: props.leadId != null ? Number(props.leadId) : undefined,
    });
    await proposalItems.update((created as any).id, { blocks: toEntries() });
    presence.setMood('warm');
    presence.bump(0.7);
    toast.success('Proposal draft created');
    router.push(`/proposals/${(created as any).id}`);
  } catch (e: any) {
    console.error('[DocumentGenerativeCanvas] save failed:', e?.message);
    toast.error(e?.message || 'Could not create the proposal draft');
  } finally {
    saving.value = false;
  }
}

/** Leave the canvas — close the overlay (embedded) or go back (standalone). */
function exit() {
  if (props.embedded) { emit('close'); return; }
  if (import.meta.client && window.history.length > 1) router.back();
  else router.push('/apps/money?floor=documents&tab=proposals');
}

/** Embedded mode — hand the edited blocks back to the host, which persists. */
function applyToHost() {
  if (!blocks.value.length) return;
  presence.setMood('warm');
  presence.bump(0.6);
  emit('apply', toEntries());
}

const assistantLine = computed(() => {
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant');
  return last?.content?.trim() || '';
});
</script>

<template>
  <div class="dgc">
    <EarnestAura :presence="presence" class="dgc__aura" />

    <div class="dgc__inner">
      <header class="dgc__head">
        <div class="dgc__mark"><EarnestPresenceDot aperture /></div>
        <div class="dgc__head-copy">
          <p class="dgc__eyebrow">Draft a proposal with Earnest</p>
          <p class="dgc__note">
            <span v-if="isDrafting" class="dgc__note-live">Drafting…</span>
            <span v-else-if="assistantLine">{{ assistantLine }}</span>
            <span v-else-if="lastNote">{{ lastNote }}</span>
            <span v-else>Describe the proposal — client, scope, pricing — and I’ll draft it.</span>
          </p>
        </div>
        <template v-if="blocks.length">
          <button v-if="embedded" class="dgc__save" @click="applyToHost">Apply to proposal</button>
          <button v-else class="dgc__save" :disabled="saving" @click="saveDraft">
            {{ saving ? 'Creating…' : 'Save as draft' }}
          </button>
        </template>
        <button class="dgc__close" aria-label="Close" title="Close" @click="exit">
          <Icon name="lucide:x" />
        </button>
      </header>

      <input
        v-if="blocks.length && !embedded"
        v-model="title"
        class="dgc__title"
        placeholder="Proposal title"
      />

      <div ref="canvasEl" class="dgc__canvas">
        <TransitionGroup name="dgc-fade" tag="div" class="dgc__stack">
          <article
            v-for="block in blocks"
            :key="block.id"
            :data-canvas-block="block.id"
            class="dgc__paper"
          >
            <!-- rich_text -->
            <template v-if="block.kind === 'rich_text'">
              <h3 v-if="block.data?.heading" class="dgc__rt-h">{{ block.data.heading }}</h3>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="dgc__rt-body" v-html="renderMarkdown(block.data?.body_markdown || '')" />
            </template>

            <!-- scope_tree -->
            <template v-else-if="block.kind === 'scope_tree'">
              <p class="dgc__scope-label">Scope of work</p>
              <ol class="dgc__phases">
                <li v-for="(p, i) in phases(block)" :key="p.id || i" class="dgc__phase">
                  <div class="dgc__phase-head">
                    <span class="dgc__phase-n">{{ i + 1 }}</span>
                    <span class="dgc__phase-title">{{ p.heading }}</span>
                    <span v-if="p.fee != null" class="dgc__phase-fee">{{ money(p.fee) }}</span>
                    <span v-else-if="p.hours != null" class="dgc__phase-fee">{{ p.hours }} hrs</span>
                  </div>
                  <p v-if="p.summary" class="dgc__phase-sum">{{ p.summary }}</p>
                  <ul v-if="Array.isArray(p.bullets) && p.bullets.length" class="dgc__phase-bullets">
                    <li v-for="(b, bi) in p.bullets" :key="bi">{{ b }}</li>
                  </ul>
                </li>
              </ol>
            </template>

            <template v-else>
              <p class="dgc__unsupported">{{ block.kind }}</p>
            </template>
          </article>
        </TransitionGroup>

        <div v-if="!blocks.length && !isDrafting" class="dgc__empty">
          <p class="dgc__empty-title">A blank proposal.</p>
          <p class="dgc__empty-sub">Tell me the client, the work, and the shape of the fees — I’ll draft the whole thing, then we refine it together.</p>
          <div class="dgc__suggestions">
            <button v-for="s in SUGGESTIONS" :key="s" class="dgc__chip" @click="runSuggestion(s)">{{ s }}</button>
          </div>
        </div>
      </div>

      <p v-if="error" class="dgc__error">{{ error }}</p>

      <div class="dgc__bar">
        <textarea
          v-model="intent"
          class="dgc__input"
          rows="1"
          :placeholder="blocks.length ? 'Refine — e.g. “make phase 2 fixed-fee” or “add a terms section”' : 'Describe the proposal…'"
          @focus="canvas.noteTyping()"
          @input="canvas.noteTyping()"
          @blur="canvas.noteRest()"
          @keydown="onIntentKeydown"
        />
        <button class="dgc__send" :disabled="!intent.trim() || isStreaming" @click="submitIntent">
          <Icon :name="isStreaming ? 'lucide:loader-2' : 'lucide:arrow-up'" :class="{ 'dgc__spin': isStreaming }" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dgc {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background: hsl(var(--aura-ground));
  color: hsl(var(--aura-foreground));
  border-radius: 1.25rem;
}
.dgc__aura { position: absolute; inset: 0; z-index: 0; opacity: 0.45; pointer-events: none; }
.dgc__inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  height: 100%;
  padding: 1.25rem clamp(1rem, 3vw, 2rem);
}
.dgc__head { display: flex; align-items: center; gap: 0.85rem; }
.dgc__mark { position: relative; width: 2.25rem; height: 2.25rem; flex: none; display: flex; align-items: center; justify-content: center; }
.dgc__head-copy { flex: 1; min-width: 0; }
.dgc__eyebrow { margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #7e93b0; }
.dgc__note { margin: 0.15rem 0 0; font-size: 0.95rem; line-height: 1.45; color: hsl(var(--aura-foreground-muted)); max-width: 60ch; }
.dgc__note-live { color: #9fb4d6; }
.dgc__save {
  flex: none; border-radius: 9999px; padding: 0.5rem 1rem; font-size: 0.82rem; font-weight: 600;
  color: #06210f; background: linear-gradient(180deg, #6fe3a6, #3fbe82); border: none; cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.dgc__save:hover { transform: translateY(-1px); }
.dgc__save:disabled { opacity: 0.6; cursor: default; }
.dgc__close {
  flex: none; width: 2rem; height: 2rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center;
  color: hsl(var(--aura-foreground-muted)); background: hsl(var(--aura-glass-1)); border: 1px solid hsl(var(--aura-rim)); cursor: pointer;
  font-size: 1rem; transition: background 0.15s ease;
}
.dgc__close:hover { background: hsl(var(--aura-glass-3)); }

.dgc__title {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid hsl(var(--aura-rim));
  color: hsl(var(--aura-foreground));
  font-size: 1.35rem;
  font-weight: 600;
  padding: 0.2rem 0 0.5rem;
  outline: none;
}
.dgc__title::placeholder { color: #64769a; }

.dgc__canvas {
	flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0.35rem 0.1rem 0.75rem; scrollbar-width: thin;
	/* Soften the scroll edge — a block running past the fold reads as "more
	   below" rather than a chopped card. */
	-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%);
	mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%);
}
.dgc__stack { display: flex; flex-direction: column; gap: 0.9rem; max-width: 780px; margin: 0 auto; width: 100%; }

/* Paper cards — a light document surface against the dark aura. */
.dgc__paper {
  background: #fbfaf6;
  color: #1e2430;
  border-radius: 0.75rem;
  padding: 1.4rem 1.6rem;
  box-shadow: 0 10px 30px -12px rgba(0,0,0,0.5);
  will-change: transform, opacity;
}
.dgc__rt-h { margin: 0 0 0.5rem; font-size: 1.15rem; font-weight: 700; color: #141a24; }
.dgc__rt-body { font-size: 0.95rem; line-height: 1.6; color: #2b3342; }
.dgc__rt-body :deep(h1), .dgc__rt-body :deep(h2), .dgc__rt-body :deep(h3) { font-weight: 700; margin: 0.6rem 0 0.35rem; }
.dgc__rt-body :deep(ul), .dgc__rt-body :deep(ol) { padding-left: 1.2rem; margin: 0.4rem 0; }
.dgc__rt-body :deep(p) { margin: 0.4rem 0; }

.dgc__scope-label { margin: 0 0 0.75rem; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #8a93a3; }
.dgc__phases { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.9rem; counter-reset: none; }
.dgc__phase { border-left: 2px solid #e4e0d4; padding-left: 0.9rem; }
.dgc__phase-head { display: flex; align-items: baseline; gap: 0.5rem; }
.dgc__phase-n {
  flex: none; width: 1.35rem; height: 1.35rem; border-radius: 9999px; background: #1e2430; color: #fbfaf6;
  font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;
}
.dgc__phase-title { flex: 1; font-weight: 650; font-size: 1rem; color: #141a24; }
.dgc__phase-fee { font-variant-numeric: tabular-nums; font-weight: 600; color: #2f7d54; font-size: 0.9rem; }
.dgc__phase-sum { margin: 0.35rem 0 0 1.85rem; font-size: 0.9rem; line-height: 1.5; color: #47505f; }
.dgc__phase-bullets { margin: 0.4rem 0 0 1.85rem; padding-left: 1rem; color: #3a4250; font-size: 0.88rem; line-height: 1.5; }
.dgc__unsupported { color: #b04a4a; font-style: italic; margin: 0; }

.dgc__empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4rem; padding: 2.5rem 1rem; max-width: 640px; margin: 1.5rem auto 0; }
.dgc__empty-title { margin: 0; font-size: 1.15rem; font-weight: 600; color: #dfe8f6; }
.dgc__empty-sub { margin: 0; color: #9fb0cc; font-size: 0.9rem; line-height: 1.5; }
.dgc__suggestions { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; width: 100%; }
.dgc__chip {
  text-align: left; padding: 0.7rem 1rem; border-radius: 1rem; font-size: 0.86rem; line-height: 1.4;
  color: hsl(var(--aura-foreground-muted)); background: hsl(var(--aura-glass-1)); border: 1px solid hsl(var(--aura-rim)); cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}
.dgc__chip:hover { background: hsl(var(--aura-glass-2)); border-color: rgba(120,200,160,0.45); transform: translateY(-1px); }
.dgc__error { margin: 0; font-size: 0.85rem; color: #ff9a9a; }

.dgc__bar {
  display: flex; align-items: flex-end; gap: 0.6rem; padding: 0.55rem 0.6rem 0.55rem 1rem;
  border-radius: 1.25rem; background: hsl(var(--aura-glass-1)); border: 1px solid hsl(var(--aura-rim)); backdrop-filter: blur(10px);
}
.dgc__input {
  flex: 1; resize: none; max-height: 140px; background: transparent; border: none; outline: none;
  color: #eaf1fb; font-size: 0.95rem; line-height: 1.5; padding: 0.35rem 0; font-family: inherit;
}
.dgc__input::placeholder { color: #8093ad; }
.dgc__send {
  flex: none; width: 2.4rem; height: 2.4rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center;
  border: none; cursor: pointer; color: #06210f; background: linear-gradient(180deg, #6fe3a6, #3fbe82); font-size: 1.05rem;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dgc__send:hover:not(:disabled) { transform: translateY(-1px); }
.dgc__send:disabled { opacity: 0.4; cursor: default; }
.dgc__spin { animation: dgc-spin 0.8s linear infinite; }
@keyframes dgc-spin { to { transform: rotate(360deg); } }

.dgc-fade-enter-from { opacity: 0; }
.dgc-fade-leave-to { opacity: 0; }
.dgc-fade-leave-active { position: absolute; }
</style>
